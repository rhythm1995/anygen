import { HttpException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pricing, type CreationType } from "@dreamina/shared";

import { SupabaseClientFactory } from "../auth/supabase.client";
import { CreditsService } from "../credits/credits.service";
import { StorageService } from "../assets/storage.service";
import { nextStatus } from "./state-machine";
import { GENERATION_PROVIDER, OPENROUTER_PROVIDER, MissingProviderConfig, type GenerationProvider } from "./providers/types";

@Injectable()
export class GenerationService {
  constructor(
    @Inject(GENERATION_PROVIDER) private readonly arkProvider: GenerationProvider,
    @Inject(OPENROUTER_PROVIDER) private readonly openRouterProvider: GenerationProvider,
    private readonly factory: SupabaseClientFactory,
    private readonly credits: CreditsService,
    private readonly storage: StorageService,
  ) {}

  /** 按模型所属供应商路由 Provider（未知供应商回退 ark） */
  private providerFor(modelProvider: string): GenerationProvider {
    return modelProvider === "openrouter" ? this.openRouterProvider : this.arkProvider;
  }

  private get db(): SupabaseClient {
    return this.factory.serviceClient;
  }

  /** 从 models 表取模型（admin 配置驱动）；不存在/停用 → 404 */
  private async resolveModel(creationType: CreationType, modelCode?: string) {
    let q = this.db
      .from("models")
      .select("*")
      .eq("creation_type", creationType)
      .eq("enabled", true);
    q = modelCode ? q.eq("code", modelCode) : q.eq("is_default", true);
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new HttpException(`model not found for ${creationType}${modelCode ? `:${modelCode}` : ""}`, 404);
    return data;
  }

  costOf(model: { unit_type: string; price_cents: number; resolution_factor: Record<string, number> }, params: Record<string, unknown>): number {
    return pricing.costCents(model as never, params as never);
  }

  async createTask(
    userId: string,
    input: { type: CreationType; prompt: string; model_code?: string; params?: Record<string, unknown> },
  ) {
    const model = await this.resolveModel(input.type, input.model_code);
    const params = input.params ?? {};
    const cost = this.costOf(model, params);

    const taskId = randomUUID();
    const { data: task, error } = await this.db
      .from("generation_tasks")
      .insert({
        id: taskId,
        user_id: userId,
        type: input.type,
        prompt: input.prompt,
        params: { ...params, model_code: model.code, model_name: model.display_name },
        model_code: model.code,
        cost_cents: cost,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const debited = await this.credits.tryDebit(userId, cost, taskId).catch(async (e) => {
      await this.failTask(task, "debit error");
      throw e;
    });
    if (!debited) {
      await this.db.from("generation_tasks").delete().eq("id", taskId);
      throw new HttpException("insufficient balance", 402);
    }

    // 音乐/配音/数字人/动作模仿：Provider 接口就绪但引擎未配置（CONCLUSIONS D7 无 mock）
    if (input.type !== "image" && input.type !== "video") {
      await this.credits.refund(userId, cost, taskId);
      await this.db.from("generation_tasks").delete().eq("id", taskId);
      throw new HttpException(`generation provider unavailable: no engine configured for ${input.type}`, 503);
    }
    const engineType: "image" | "video" = input.type;

    try {
      const submitted = await this.providerFor(model.provider).submit({
        type: engineType,
        prompt: input.prompt,
        params: { ...params, model_code: model.code },
      });
      if (submitted.immediateUrls?.length) {
        const updated = await this.completeTask(task, submitted.immediateUrls, engineType);
        return this.serialize(updated);
      }
      const { data: updated, error: upErr } = await this.db
        .from("generation_tasks")
        .update({ status: nextStatus("queued", "running"), remote_id: submitted.remoteId, started_at: new Date().toISOString() })
        .eq("id", taskId)
        .select()
        .single();
      if (upErr) throw new Error(upErr.message);
      return this.serialize(updated);
    } catch (e) {
      await this.credits.refund(userId, cost, taskId);
      await this.db.from("generation_tasks").delete().eq("id", taskId);
      if (e instanceof MissingProviderConfig) {
        throw new HttpException(`generation provider unavailable: ${e.message}`, 503);
      }
      throw new HttpException(`provider submit failed: ${(e as Error).message}`, 502);
    }
  }

  async pollTask(userId: string, id: string) {
    const { data: task, error } = await this.db
      .from("generation_tasks")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!task) throw new HttpException("task not found", 404);
    if (task.status !== "running") return this.serialize(task);

    const poll = await this.providerFor(task.provider ?? "ark").poll(task.remote_id!);
    if (poll.status === "succeeded") {
      const updated = await this.completeTask(task, poll.urls!, task.type);
      return this.serialize(updated);
    }
    if (poll.status === "failed") {
      await this.db
        .from("generation_tasks")
        .update({ status: nextStatus("running", "failed"), error: poll.error, finished_at: new Date().toISOString() })
        .eq("id", task.id);
      await this.credits.refund(userId, task.cost_cents, task.id);
      return this.serialize({ ...task, status: "failed", error: poll.error });
    }
    return this.serialize(task);
  }

  private async completeTask(task: any, urls: string[], type: "image" | "video") {
    const assetIds: string[] = [];
    for (const [i, url] of urls.entries()) {
      const key = `${type}/${task.user_id}/${randomUUID()}.${type === "image" ? "jpg" : "mp4"}`;
      try {
        await this.storage.uploadFromUrl({ key, remoteUrl: url, contentType: type === "image" ? "image/jpeg" : "video/mp4" });
        const asset = await this.storage.register(this.db, {
          userId: task.user_id,
          key,
          kind: type,
          mime: type === "image" ? "image/jpeg" : "video/mp4",
          meta: { taskId: task.id, prompt: task.prompt },
        });
        assetIds.push(asset.id);
      } catch {
        await this.storage
          .register(this.db, {
            userId: task.user_id,
            key: `failed/${task.id}/${i}`,
            kind: type,
            mime: "application/octet-stream",
            meta: { sourceUrl: url, taskId: task.id },
          })
          .catch(() => undefined);
      }
    }
    const { data, error } = await this.db
      .from("generation_tasks")
      .update({
        status: nextStatus(task.status as "queued" | "running", "succeeded"),
        outputs: assetIds,
        finished_at: new Date().toISOString(),
      })
      .eq("id", task.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  private async failTask(task: any, reason: string) {
    await this.db
      .from("generation_tasks")
      .update({ status: "failed", error: reason, finished_at: new Date().toISOString() })
      .eq("id", task.id);
  }

  async listTasks(userId: string) {
    const { data, error } = await this.db
      .from("generation_tasks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map((t) => this.serialize(t));
  }

  private serialize(task: any) {
    return {
      id: task.id,
      type: task.type,
      prompt: task.prompt,
      params: task.params,
      model_code: task.model_code,
      status: task.status,
      error: task.error,
      cost_cents: task.cost_cents,
      outputs: task.outputs ?? [],
      createdAt: task.created_at,
      finishedAt: task.finished_at,
    };
  }
}
