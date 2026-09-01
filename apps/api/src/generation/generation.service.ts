import { HttpException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pricing, type CreationType } from "@dreamina/shared";

import { SupabaseClientFactory } from "../auth/supabase.client";
import { CreditsService } from "../credits/credits.service";
import { StorageService } from "../assets/storage.service";
import { nextStatus } from "./state-machine";
import { GENERATION_PROVIDER, OPENROUTER_PROVIDER, AUDIO_PROVIDER, MissingProviderConfig, type GenerationProvider } from "./providers/types";
import { ProviderKeysService } from "../admin/provider-keys.service";

@Injectable()
export class GenerationService {
  constructor(
    @Inject(GENERATION_PROVIDER) private readonly arkProvider: GenerationProvider,
    @Inject(OPENROUTER_PROVIDER) private readonly openRouterProvider: GenerationProvider,
    @Inject(AUDIO_PROVIDER) private readonly audioProvider: GenerationProvider,
    private readonly factory: SupabaseClientFactory,
    private readonly credits: CreditsService,
    private readonly storage: StorageService,
    private readonly keys: ProviderKeysService,
  ) {}

  /** 按创作类型 + 模型供应商路由（D6：音乐/配音走 apps/api HTTP，其余 Ark/OpenRouter） */
  private providerFor(creationType: string, modelProvider: string): GenerationProvider {
    if (creationType === "music" || creationType === "dubbing") return this.audioProvider;
    if (modelProvider === "openrouter") return this.openRouterProvider;
    return this.arkProvider;
  }

  /** D14：图/视频请求时注入 admin/env 密钥 */
  private async boundProvider(creationType: string, modelProvider: string): Promise<GenerationProvider> {
    const provider = this.providerFor(creationType, modelProvider);
    if (creationType === "music" || creationType === "dubbing") return provider;
    const name = modelProvider === "openrouter" ? "openrouter" : "ark";
    const cfg = await this.keys.resolveConfig(name);
    if (provider.withCredentials) {
      return provider.withCredentials({ apiKey: cfg.apiKey ?? "", baseUrl: cfg.baseUrl });
    }
    return provider;
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

    const prompt = this.composePrompt(input.type, input.prompt, params);

    try {
      const provider = await this.boundProvider(input.type, model.provider);
      const submitted = await provider.submit({
        type: input.type as never,
        prompt,
        params: { ...params, model_code: model.code },
      });
      if (submitted.immediateUrls?.length) {
        const updated = await this.completeTask(task, submitted.immediateUrls, input.type);
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

    const poll = await (await this.boundProvider(task.type, task.provider ?? "ark")).poll(task.remote_id!);
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

  private composePrompt(type: string, prompt: string, params: Record<string, unknown>): string {
    if (type === "digital_human") {
      const speech = typeof params.speech === "string" ? params.speech : prompt;
      const motion = typeof params.motion === "string" ? params.motion : "";
      return [`说话内容：${speech}`, motion ? `动作描述：${motion}` : "", prompt !== speech ? prompt : ""]
        .filter(Boolean)
        .join("\n");
    }
    if (type === "motion_mimic") {
      const style = typeof params.style === "string" ? params.style : "";
      return [prompt, style ? `动作风格：${style}` : ""].filter(Boolean).join("\n");
    }
    return prompt;
  }

  private assetKindOf(type: string): { kind: "image" | "video" | "audio"; ext: string; mime: string } {
    if (type === "image") return { kind: "image", ext: "jpg", mime: "image/jpeg" };
    if (type === "music" || type === "dubbing") return { kind: "audio", ext: "mp3", mime: "audio/mpeg" };
    return { kind: "video", ext: "mp4", mime: "video/mp4" };
  }

  private async completeTask(task: any, urls: string[], type: string) {
    const spec = this.assetKindOf(type);
    const assetIds: string[] = [];
    for (const [i, url] of urls.entries()) {
      const key = `${spec.kind}/${task.user_id}/${randomUUID()}.${spec.ext}`;
      try {
        if (url.startsWith("http://") || url.startsWith("https://")) {
          await this.storage.uploadFromUrl({ key, remoteUrl: url, contentType: spec.mime });
        }
        const asset = await this.storage.register(this.db, {
          userId: task.user_id,
          key: url.startsWith("http") ? key : key,
          kind: spec.kind,
          mime: spec.mime,
          meta: { taskId: task.id, prompt: task.prompt },
        });
        assetIds.push(asset.id);
      } catch {
        await this.storage
          .register(this.db, {
            userId: task.user_id,
            key: `failed/${task.id}/${i}`,
            kind: spec.kind,
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
