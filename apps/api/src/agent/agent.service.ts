import { HttpException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseClientFactory } from "../auth/supabase.client";
import { CreditsService } from "../credits/credits.service";
import { GenerationService } from "../generation/generation.service";

export interface PlanStep {
  title: string;
  type: "image" | "video" | "music" | "note";
  prompt_suffix: string;
  count?: number;
  params?: Record<string, unknown>;
}

export interface PlanTemplate {
  steps: PlanStep[];
}

/**
 * Agent v1：技能模板执行器（CONCLUSIONS D5）。
 * 计划来自 agent_skills.plan_template（声明式，无需 LLM）；执行 = 串行调用
 * GenerationService（预扣→任务→完成→产物→登记），失败重试一次，失败步骤
 * 标记 failed 但会话继续（按完成步骤结算，CONCLUSIONS 计费口径）。
 */
@Injectable()
export class AgentService {
  constructor(
    private readonly factory: SupabaseClientFactory,
    private readonly generation: GenerationService,
  ) {}

  private get db(): SupabaseClient {
    return this.factory.serviceClient;
  }

  async createSession(userId: string, input: { skill_id?: string; prompt: string }) {
    // 取技能模板（无 skill_id → 默认四分镜图片模板）
    let template: PlanTemplate | null = null;
    let skillId = input.skill_id ?? "";
    if (skillId) {
      const { data: skill, error } = await this.db
        .from("agent_skills")
        .select("plan_template")
        .eq("id", skillId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      template = (skill?.plan_template as PlanTemplate) ?? null;
    }
    // 空模板（技能存在但未配 steps）→ 回退默认四分镜
    if (!template || !(template.steps?.length)) {
      template = {
        steps: [1, 2, 3, 4].map((i) => ({
          title: `分镜 ${i}`,
          type: "image" as const,
          prompt_suffix: `镜头 ${i}，电影感构图`,
          count: 1,
          params: { resolution: "2k", count: 1 },
        })),
      };
      skillId = "";
    }

    const steps: { seq: number; title: string; type: string; prompt: string; params: Record<string, unknown> }[] = [];
    let seq = 1;
    for (const s of template.steps ?? []) {
      const count = s.count ?? 1;
      for (let c = 1; c <= count; c++) {
        const title = count > 1 ? `${s.title} ${c}/${count}` : s.title;
        steps.push({
          seq: seq++,
          title,
          type: s.type,
          prompt: `${input.prompt} — ${s.prompt_suffix}`,
          params: { ...(s.params ?? {}), resolution: s.params?.resolution ?? "2k", count: 1 },
        });
      }
    }
    if (!steps.length) throw new HttpException("empty plan", 422);

    // 预算：每步按 image 2k 单价预估（与 models 表一致：5¢×1.8=9¢/张，向上取整后再汇总）
    const { data: imgModel } = await this.db
      .from("models")
      .select("price_cents,resolution_factor")
      .eq("creation_type", "image")
      .eq("enabled", true)
      .eq("is_default", true)
      .maybeSingle();
    const pricePer = imgModel ? Math.ceil(imgModel.price_cents * ((imgModel.resolution_factor as any)?.["2k"] ?? 1.8)) : 9;
    const budget = steps.length * pricePer;

    const sessionId = randomUUID();
    const { data: session, error } = await this.db
      .from("agent_sessions")
      .insert({
        id: sessionId,
        user_id: userId,
        skill_id: skillId,
        prompt: input.prompt,
        plan: { steps: steps.map((s) => ({ seq: s.seq, title: s.title, type: s.type })) },
        status: "running",
        budget_cents: budget,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await this.db.from("agent_steps").insert(steps.map((s) => ({ ...s, session_id: sessionId })));
    return session;
  }

  getSteps(userId: string, sessionId: string) {
    return this.db
      .from("agent_steps")
      .select("*")
      .eq("session_id", sessionId)
      .order("seq");
  }

  getSession(userId: string, sessionId: string) {
    return this.db.from("agent_sessions").select("*").eq("id", sessionId).eq("user_id", userId).maybeSingle();
  }

  /** 执行一轮：把 pending 步骤推进为生成任务（前端轮询会话状态时触发，幂等） */
  async advance(userId: string, sessionId: string): Promise<{ status: string }> {
    const { data: session, error } = await this.getSession(userId, sessionId);
    if (error) throw new Error(error.message);
    if (!session) throw new HttpException("session not found", 404);
    if (!["planning", "running"].includes(session.status)) return { status: session.status };

    await this.db.from("agent_sessions").update({ status: "running" }).eq("id", sessionId);
    const { data: pending, error: perr } = await this.db
      .from("agent_steps")
      .select("*")
      .eq("session_id", sessionId)
      .in("status", ["pending", "running"])
      .order("seq");
    if (perr) throw new Error(perr.message);

    for (const step of pending ?? []) {
      if (step.status === "running") {
        // 已有任务：查状态
        const result = await this.generation.pollTask(userId, step.task_id);
        await this.applyResult(step.id, result.status, result.outputs?.[0], result.error, result.cost_cents ?? step.cost_cents);
        continue;
      }
      // 新步骤：提交生成任务（内部完成扣分/登记）
      const modelCode = await this.resolveModelCode(step.type);
      try {
        const task = await this.generation.createTask(userId, {
          type: step.type as "image" | "video" | "music",
          prompt: step.prompt,
          model_code: modelCode,
          params: step.params,
        });
        await this.db.from("agent_steps").update({ status: "running", task_id: task.id, cost_cents: task.cost_cents }).eq("id", step.id);
      } catch (e) {
        const err = e as Error & { status?: number };
        const msg = err.message;
        // 不可恢复（引擎未配置 503 / 预算不足 402 / 模型缺失 404）→ 步骤与会话置失败，停止推进
        const fatal = [503, 402, 404].includes(err.status ?? 0) || msg.includes("insufficient");
        if (fatal) {
          await this.db
            .from("agent_steps")
            .update({ status: "failed", error: msg.slice(0, 300) })
            .eq("id", step.id);
          // 引擎未配置/预算不足对后续步骤同样致命：一次置失败，避免步骤悬挂
          await this.db
            .from("agent_steps")
            .update({ status: "failed", error: "会话已终止: " + msg.slice(0, 200) })
            .eq("session_id", sessionId)
            .in("status", ["pending", "running"]);
          await this.failSession(sessionId, msg.slice(0, 200));
          return { status: "failed" };
        }
        // 可恢复（供应商 5xx 等）→ 留 pending，下次 advance 重试
        await this.db
          .from("agent_steps")
          .update({ error: msg.slice(0, 300) })
          .eq("id", step.id);
      }
    }
    // 汇总会话状态
    const { data: all } = await this.db.from("agent_steps").select("status,cost_cents,asset_id").eq("session_id", sessionId);
    const rows = all ?? [];
    const spent = rows.reduce((a, r) => a + (r.cost_cents ?? 0), 0);
    const done = rows.every((r) => ["succeeded", "failed", "skipped"].includes(r.status));
    const anySucceeded = rows.some((r) => r.status === "succeeded");
    await this.db
      .from("agent_sessions")
      .update({
        status: done ? (anySucceeded ? "succeeded" : "failed") : "running",
        spent_cents: spent,
        finished_at: done ? new Date().toISOString() : null,
        summary: done ? `${rows.filter((r) => r.status === "succeeded").length}/${rows.length} 步完成` : "",
      })
      .eq("id", sessionId);
    const { data: s2 } = await this.getSession(userId, sessionId);
    return { status: s2?.status ?? "running" };
  }

  private async applyResult(stepId: string, status: string, outputAsset: string | undefined, error: string | undefined, costCents: number) {
    if (status === "succeeded") {
      await this.db.from("agent_steps").update({ status: "succeeded", asset_id: outputAsset ?? null }).eq("id", stepId);
    } else if (status === "failed") {
      await this.db.from("agent_steps").update({ status: "failed", error: error ?? "task failed" }).eq("id", stepId);
    }
    void costCents;
  }

  private async resolveModelCode(type: string): Promise<string | undefined> {
    const { data } = await this.db
      .from("models")
      .select("code")
      .eq("creation_type", type)
      .eq("enabled", true)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    return data?.code ?? undefined;
  }

  private async failSession(sessionId: string, reason: string) {
    await this.db
      .from("agent_sessions")
      .update({ status: "failed", error: reason.slice(0, 300), finished_at: new Date().toISOString() })
      .eq("id", sessionId);
  }

  async listSessions(userId: string) {
    const { data, error } = await this.db
      .from("agent_sessions")
      .select("id,skill_id,prompt,status,budget_cents,spent_cents,summary,created_at,finished_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  }
}
