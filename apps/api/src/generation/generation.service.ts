import { HttpException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationType } from "@dreamina/shared";

import { SupabaseClientFactory } from "../auth/supabase.client";
import { CreditsService } from "../credits/credits.service";
import { StorageService } from "../assets/storage.service";
import { nextStatus } from "./state-machine";
import { GENERATION_PROVIDER, type GenerationProvider } from "./providers/types";
import { MissingProviderConfig } from "./providers/types";

export const TASK_COST: Record<GenerationType, number> = { image: 4, video: 20 };

@Injectable()
export class GenerationService {
  constructor(
    @Inject(GENERATION_PROVIDER) private readonly provider: GenerationProvider,
    private readonly factory: SupabaseClientFactory,
    private readonly credits: CreditsService,
    private readonly storage: StorageService,
  ) {}

  private get db(): SupabaseClient {
    return this.factory.serviceClient;
  }

  async createTask(userId: string, input: { type: GenerationType; prompt: string; params?: Record<string, unknown> }) {
    const cost = TASK_COST[input.type];
    const taskId = randomUUID();
    const { data: task, error } = await this.db
      .from("generation_tasks")
      .insert({ id: taskId, user_id: userId, type: input.type, prompt: input.prompt, params: input.params ?? {}, cost })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const debited = await this.credits.tryDebit(userId, cost, taskId).catch(async (e) => {
      await this.failTask(task, "debit error");
      throw e;
    });
    if (!debited) {
      await this.db.from("generation_tasks").delete().eq("id", taskId);
      throw new HttpException("insufficient credits", 402);
    }

    try {
      const submitted = await this.provider.submit({ type: input.type, prompt: input.prompt, params: input.params ?? {} });
      if (submitted.immediateUrls?.length) {
        const updated = await this.completeTask(task, submitted.immediateUrls, input.type);
        return updated;
      }
      const { data: updated, error: upErr } = await this.db
        .from("generation_tasks")
        .update({ status: nextStatus("queued", "running"), remote_id: submitted.remoteId, started_at: new Date().toISOString() })
        .eq("id", taskId)
        .select()
        .single();
      if (upErr) throw new Error(upErr.message);
      return updated;
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

    const poll = await this.provider.poll(task.remote_id!);
    if (poll.status === "succeeded") {
      const updated = await this.completeTask(task, poll.urls!, task.type);
      return this.serialize(updated);
    }
    if (poll.status === "failed") {
      await this.db
        .from("generation_tasks")
        .update({ status: nextStatus("running", "failed"), error: poll.error, finished_at: new Date().toISOString() })
        .eq("id", task.id);
      await this.credits.refund(userId, task.cost, task.id);
      return this.serialize({ ...task, status: "failed", error: poll.error });
    }
    return this.serialize(task);
  }

  private async completeTask(task: any, urls: string[], type: GenerationType) {
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
        // 单个产物失败不阻塞任务成功（URL 保存在 meta 供追溯）
        await this.storage.register(this.db, {
          userId: task.user_id,
          key: `failed/${task.id}/${i}`,
          kind: type,
          mime: "application/octet-stream",
          meta: { sourceUrl: url, taskId: task.id },
        }).catch(() => undefined);
      }
    }
    const { data, error } = await this.db
      .from("generation_tasks")
      .update({ status: nextStatus(task.status as "queued" | "running", "succeeded"), outputs: assetIds, finished_at: new Date().toISOString() })
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
      status: task.status,
      error: task.error,
      cost: task.cost,
      outputs: task.outputs ?? [],
      createdAt: task.created_at,
      finishedAt: task.finished_at,
    };
  }
}
