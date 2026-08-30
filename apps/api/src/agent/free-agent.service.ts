import { HttpException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseClientFactory } from "../auth/supabase.client";
import { CreditsService } from "../credits/credits.service";
import { ConfigService } from "../config/config.service";
import { GenerationService } from "../generation/generation.service";

interface FreeAgentEvent {
  type: "status" | "tool_call" | "tool_result" | "message" | "done" | "error";
  payload: Record<string, unknown>;
}

/**
 * Agent v2：自由 agent loop（CONCLUSIONS D5，路线 B）。
 * OpenAI 兼容 chat.completions + tool calling 自建循环；LLM 走 env 配置
 * （LLM_API_BASE/LLM_API_KEY/LLM_MODEL，兼容 GLM/Ark/OpenAI）。无 key → 503。
 * 步骤持久化复用 agent_sessions/agent_steps（source=free）。
 */
@Injectable()
export class FreeAgentService {
  private static readonly TOOLS = [
    {
      type: "function",
      function: {
        name: "generate_image",
        description: "按提示词生成一张图片。返回任务 ID，需要用 check_task 轮询直到成功后才有产物。",
        parameters: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "画面描述（中文）" },
            resolution: { type: "string", enum: ["1.5k", "2k", "4k"] },
          },
          required: ["prompt"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "generate_video",
        description: "按提示词生成一段视频（4-15 秒）。返回任务 ID。",
        parameters: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "画面描述（中文），可含运镜/时长意图" },
            resolution: { type: "string", enum: ["480p", "720p", "1080p"] },
          },
          required: ["prompt"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "check_task",
        description: "查询生成任务状态。succeeded 时返回产物。",
        parameters: { type: "object", properties: { task_id: { type: "string" } }, required: ["task_id"] },
      },
    },
    {
      type: "function",
      function: {
        name: "finish",
        description: "任务全部完成时调用，向用户交付总结。",
        parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
      },
    },
  ] as const;

  constructor(
    private readonly factory: SupabaseClientFactory,
    private readonly config: ConfigService,
    private readonly generation: GenerationService,
    private readonly credits: CreditsService,
  ) {}

  private get db(): SupabaseClient {
    return this.factory.serviceClient;
  }

  getSession(userId: string, sessionId: string) {
    return this.db.from("agent_sessions").select("*").eq("id", sessionId).eq("user_id", userId).maybeSingle();
  }

  private assertConfigured(): void {
    if (!this.config.useLlm) {
      throw new HttpException("generation provider unavailable: LLM_API_KEY not configured (agent v2)", 503);
    }
  }

  /** 执行一轮完整 loop；onEvent 逐事件回调（SSE 用）。上限 12 次模型调用。 */
  async runSession(
    userId: string,
    sessionId: string,
    maxModelCalls = 12,
    onEvent?: (e: FreeAgentEvent) => void,
  ): Promise<{ status: string; events: FreeAgentEvent[] }> {
    return this._runSession(userId, sessionId, maxModelCalls, onEvent);
  }

  async _runSession(
    userId: string,
    sessionId: string,
    maxModelCalls = 12,
    onEvent?: (e: FreeAgentEvent) => void,
  ): Promise<{ status: string; events: FreeAgentEvent[] }> {
    this.assertConfigured();
    const { data: session, error } = await this.db
      .from("agent_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!session) throw new HttpException("session not found", 404);
    if (session.status === "succeeded" || session.status === "failed") return { status: session.status, events: [] };

    const events: FreeAgentEvent[] = [];
    const push = (e: FreeAgentEvent) => {
      events.push(e);
      onEvent?.(e);
    };
    const toolsUsed = new Set<string>();

    const messages: Record<string, unknown>[] = [
      {
        role: "system",
        content:
          "你是即梦创作 Agent。用工具帮用户完成创作任务：generate_image/generate_video 提交生成，check_task 轮询结果，全部完成后 finish。" +
          "生成类调用至少间隔一次 check_task；不要编造产物 URL；预算有限，按需生成。",
      },
      { role: "user", content: session.prompt },
    ];

    await this.db.from("agent_sessions").update({ status: "running" }).eq("id", sessionId);
    let finished = false;
    const pendingTasks = new Set<string>();

    for (let call = 0; call < maxModelCalls && !finished; call++) {
      const res = await fetch(`${this.config.llmApiBase}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.config.llmApiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: this.config.llmModel,
          messages,
          tools: FreeAgentService.TOOLS,
          tool_choice: "auto",
        }),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new HttpException(`LLM call failed: HTTP ${res.status} ${String(detail?.error?.message ?? "").slice(0, 120)}`, 502);
      }
      const out = (await res.json()) as any;
      const choice = out.choices?.[0]?.message;
      if (!choice) throw new HttpException("LLM returned empty choice", 502);
      messages.push(choice);
      if (choice.content) push({ type: "message", payload: { text: choice.content } });

      const toolCalls: { id: string; function: { name: string; arguments: string } }[] = choice.tool_calls ?? [];
      if (!toolCalls.length) {
        // 模型直接给文本没调工具 → 视为完成
        await this.db
          .from("agent_sessions")
          .update({ status: "succeeded", summary: String(choice.content ?? "").slice(0, 500), finished_at: new Date().toISOString() })
          .eq("id", sessionId);
        push({ type: "done", payload: { summary: choice.content } });
        finished = true;
        break;
      }

      for (const tc of toolCalls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
        let result: unknown;
        try {
          if (tc.function.name === "generate_image" || tc.function.name === "generate_video") {
            const type = tc.function.name === "generate_image" ? "image" : "video";
            const task = await this.generation.createTask(userId, {
              type,
              prompt: String(args.prompt ?? ""),
              params: { resolution: args.resolution ?? (type === "image" ? "2k" : "720p") },
            });
            pendingTasks.add(task.id);
            await this.db.from("agent_steps").insert({
              session_id: sessionId,
              seq: (await this.nextSeq(sessionId)),
              title: `${type === "image" ? "图片" : "视频"}任务`,
              type,
              prompt: String(args.prompt ?? ""),
              status: "running",
              task_id: task.id,
              cost_cents: task.cost_cents,
            });
            toolsUsed.add(tc.function.name);
            result = { task_id: task.id, status: task.status, hint: "用 check_task 轮询" };
            push({ type: "tool_call", payload: { tool: tc.function.name, task_id: task.id, prompt: args.prompt } });
          } else if (tc.function.name === "check_task") {
            const taskId = String(args.task_id ?? "");
            const polled = await this.generation.pollTask(userId, taskId);
            if (polled.status !== "running" && polled.status !== "queued") pendingTasks.delete(taskId);
            result = { task_id: taskId, status: polled.status, outputs: polled.outputs, error: polled.error };
            push({ type: "tool_result", payload: { task_id: taskId, status: polled.status } });
          } else if (tc.function.name === "finish") {
            finished = true;
            result = { ok: true };
            push({ type: "done", payload: { summary: args.summary } });
          } else {
            result = { error: `unknown tool ${tc.function.name}` };
          }
        } catch (e) {
          result = { error: (e as Error).message };
          push({ type: "error", payload: { tool: tc.function.name, error: (e as Error).message } });
        }
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 2000) });
      }
    }

    const spent = await this.credits.balance(userId);
    void spent;
    const { data: stepsRows } = await this.db.from("agent_steps").select("cost_cents").eq("session_id", sessionId);
    const spentCents = (stepsRows ?? []).reduce((a, r: any) => a + (r.cost_cents ?? 0), 0);
    const finalStatus = finished ? "succeeded" : pendingTasks.size > 0 ? "running" : "succeeded";
    await this.db
      .from("agent_sessions")
      .update({
        status: finalStatus,
        spent_cents: spentCents,
        finished_at: finished ? new Date().toISOString() : null,
        summary: finished ? "会话完成" : "存在进行中的生成任务，继续轮询",
      })
      .eq("id", sessionId);
    void toolsUsed;
    return { status: finalStatus, events };
  }

  async createFreeSession(userId: string, prompt: string) {
    this.assertConfigured();
    const { data, error } = await this.db
      .from("agent_sessions")
      .insert({ user_id: userId, skill_id: "free", prompt, status: "running", budget_cents: 500 })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  private async nextSeq(sessionId: string): Promise<number> {
    const { data } = await this.db
      .from("agent_steps")
      .select("seq")
      .eq("session_id", sessionId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data?.seq ?? 0) + 1;
  }
}
