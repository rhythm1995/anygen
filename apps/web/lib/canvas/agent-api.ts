/**
 * 画布 Agent 请求层（D12 Phase C）
 * 替换 vendor/infinite-canvas services/api/canvas-agent.ts（多渠道/Gemini direct/Responses API 全部裁剪）：
 * 单端点 POST /api/agent/canvas/turn（服务端持 LLM key），带一次「无工具重试」兜底。
 */
import { api } from "@/lib/api";
import type { CanvasAgentProtocolMessage, CanvasAgentToolCall } from "@/components/canvas/types";
import type { CanvasAgentToolDefinition } from "@/components/canvas/agent/canvas-agent-tools";

export type CanvasAgentClientConfig = {
    textModel: string;
};

export type CanvasAgentModelTurn = {
    content: string;
    reasoningContent?: string;
    responseItems?: unknown[];
    toolCalls: CanvasAgentToolCall[];
    usedJsonFallback: boolean;
};

type RequestCanvasAgentTurnInput = {
    config: CanvasAgentClientConfig;
    systemPrompt: string;
    messages: CanvasAgentProtocolMessage[];
    tools: CanvasAgentToolDefinition[];
    allowTools: boolean;
    signal?: AbortSignal;
};

function looksLikeToolCompatibilityError(message: string) {
    return /tool|function.?call|not.?support/i.test(message);
}

export async function requestCanvasAgentTurn(input: RequestCanvasAgentTurnInput): Promise<CanvasAgentModelTurn> {
    let tools = input.allowTools ? input.tools : [];
    let usedJsonFallback = !input.allowTools;
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await api<{ content: string; reasoningContent?: string; toolCalls: CanvasAgentToolCall[] }>("/agent/canvas/turn", {
                method: "POST",
                body: {
                    systemPrompt: input.systemPrompt,
                    messages: input.messages,
                    ...(tools.length ? { tools } : {}),
                    allowTools: tools.length > 0,
                },
            });
            if (input.signal?.aborted) throw new Error("Agent 已停止");
            return {
                content: res.content ?? "",
                reasoningContent: res.reasoningContent,
                toolCalls: res.toolCalls ?? [],
                usedJsonFallback,
            };
        } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            if (tools.length && attempt === 0 && looksLikeToolCompatibilityError(message)) {
                tools = [];
                usedJsonFallback = true;
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}

export async function fetchCanvasAgentConfig(): Promise<{ available: boolean; model: string | null }> {
    return api<{ available: boolean; model: string | null }>("/agent/canvas/config");
}

/** 全局系统提示词前缀（服务端不存配置，v1 直接透传技能提示词） */
export function canvasAgentSystemPrompt(_config: CanvasAgentClientConfig, prompt: string) {
    return prompt;
}

/** token 估算校准的 localStorage key（记忆压缩用，见 canvas-agent-memory） */
export function canvasAgentTokenCalibrationKey(_config: CanvasAgentClientConfig) {
    return "anygen:canvas:agent_token_calibration";
}

export function isCanvasAgentContextLimitError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return /context.?length|too.?long|token.?limit|maximum.?context|413/i.test(message);
}

/** 长会话检查点：让服务端 LLM 压缩历史（复用 turn 端点） */
export async function requestCanvasAgentCheckpoint(input: { config: CanvasAgentClientConfig; systemPrompt?: string; messages: CanvasAgentProtocolMessage[]; previousCheckpoint?: string; signal?: AbortSignal }): Promise<string> {
    const res = await api<{ content: string }>("/agent/canvas/turn", {
        method: "POST",
        body: {
            systemPrompt: "把以下画布 Agent 对话历史压缩成检查点摘要：保留创作目标、已确认方案、正式参考节点 ID、未完成事项。直接输出摘要正文。",
            messages: [{ role: "user", content: input.messages.filter((message) => message.role !== "system").map((message) => `${message.role}: ${typeof message.content === "string" ? message.content : JSON.stringify(message.content)}`).join("\n").slice(0, 60_000) }],
        },
    }).catch(() => null);
    return res?.content ?? "";
}
