import { HttpException, Injectable } from "@nestjs/common";

import { ConfigService } from "../config/config.service";

type TurnInput = {
  systemPrompt: string;
  messages: unknown[];
  tools?: { type?: string; function: { name: string; description?: string; parameters?: unknown } }[];
  allowTools?: boolean;
  temperature?: number;
  model?: string;
};

/**
 * 画布 Agent 单轮调用（OpenAI 兼容 chat/completions）。
 * key 只在服务端（LLM_API_BASE/LLM_API_KEY/LLM_MODEL）；未配置 → 503 如实文案（禁 mock）。
 */
@Injectable()
export class CanvasAgentTurnService {
  constructor(private readonly config: ConfigService) {}

  configFor(_userId: string) {
    return {
      available: this.config.useLlm,
      model: this.config.useLlm ? this.config.llmModel : null,
    };
  }

  async runTurn(_userId: string, input: TurnInput) {
    if (!this.config.useLlm) {
      throw new HttpException("generation provider unavailable: LLM_API_KEY not configured (canvas agent)", 503);
    }

    const messages = [
      { role: "system", content: input.systemPrompt },
      ...input.messages.map((message) => this.toOpenAiMessage(message)),
    ];

    const res = await fetch(`${this.config.llmApiBase}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.llmApiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: input.model || this.config.llmModel,
        messages,
        ...(input.allowTools !== false && input.tools?.length
          ? {
              tools: input.tools.map((tool) => ({
                type: "function",
                function: {
                  name: tool.function.name,
                  description: tool.function.description ?? "",
                  ...(tool.function.parameters ? { parameters: tool.function.parameters } : {}),
                },
              })),
              tool_choice: "auto",
            }
          : {}),
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      }),
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new HttpException(`LLM call failed: HTTP ${res.status} ${String(detail?.error?.message ?? "").slice(0, 160)}`, 502);
    }
    const out = (await res.json()) as {
      choices?: {
        message?: {
          content?: string | null;
          reasoning_content?: string | null;
          tool_calls?: { id: string; function: { name: string; arguments?: string } }[];
        };
      }[];
    };
    const choice = out.choices?.[0]?.message;
    if (!choice) throw new HttpException("LLM returned empty choice", 502);

    const toolCalls = (choice.tool_calls ?? []).map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: this.parseArguments(call.function.arguments),
    }));

    return {
      content: choice.content ?? "",
      reasoningContent: choice.reasoning_content ?? "",
      toolCalls,
    };
  }

  /** 协议消息 → OpenAI 格式（assistant.toolCalls → tool_calls 数组） */
  private toOpenAiMessage(message: unknown): Record<string, unknown> {
    const m = message as { role: string; content?: unknown; toolCalls?: { id: string; name: string; arguments: unknown }[]; toolCallId?: string; name?: string };
    if (m.role === "assistant") {
      return {
        role: "assistant",
        ...(typeof m.content === "string" && m.content ? { content: m.content } : {}),
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) } })) }
          : {}),
      };
    }
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: String(m.content ?? ""), ...(m.name ? { name: m.name } : {}) };
    }
    return { role: m.role, content: m.content };
  }

  private parseArguments(raw: string | undefined): Record<string, unknown> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
}
