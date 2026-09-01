"use client";
/**
 * 画布助手面板（D12 Phase C，精简版）
 * 结构参照 vendor/infinite-canvas canvas-assistant-panel/composer（AGPL-3.0）；
 * 会话持久化 = graph.chatSessions 双写 agent_sessions.project_id（D13）；LLM = /api/agent/canvas/turn。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, FolderOpen, ImagePlus, Menu, MessageSquarePlus, Square, Trash2, Upload, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "../theme-store";
import { createCanvasAgentState, runCanvasAgent } from "../agent/canvas-agent-runtime";
import { buildCanvasAgentContext } from "../agent/canvas-agent-context";
import { buildCanvasResourceReferences, type CanvasResourceReference } from "../utils/canvas-resource-references";
import { CanvasNodeType, type CanvasAgentState, type CanvasAssistantMessage, type CanvasAssistantReference, type CanvasAssistantSession, type CanvasConnection, type CanvasNodeData, type ViewportTransform } from "../types";
import type { CanvasAgentAction, CanvasAgentToolResult } from "../agent/canvas-agent-tools";

export type AssistantBridge = {
    projectId: string;
    projectTitle: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedIds: string[];
    viewport: ViewportTransform;
    textModel: string;
    imageDefaults: { resolution: string; ratio: string; count: number };
    videoDefaults: { resolution: string; seconds: number };
    imageModelCode: string;
    videoModelCode: string;
    executeAction: (action: CanvasAgentAction) => Promise<CanvasAgentToolResult>;
    onSessionsChange: (sessions: CanvasAssistantSession[], activeChatId: string | null) => void;
    onInsertAsset: (message: CanvasAssistantMessage) => void;
    onOpenUpload: () => void;
    onOpenAssets?: () => void;
};

function uid(prefix: string) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CanvasAssistantPanel({ bridge, open, onClose }: { bridge: AssistantBridge; open: boolean; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [sessions, setSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [prompt, setPrompt] = useState("");
    const [running, setRunning] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const active = useMemo(() => sessions.find((session) => session.id === activeChatId) ?? null, [sessions, activeChatId]);
    const availableReferences = useMemo(() => buildCanvasResourceReferences(bridge.nodes, bridge.connections, null), [bridge.nodes, bridge.connections]);

    useEffect(() => {
        bridge.onSessionsChange(sessions, activeChatId);
    }, [sessions, activeChatId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [active?.messages.length, running]);

    const ensureSession = useCallback((): CanvasAssistantSession => {
        const existing = sessions.find((session) => session.id === activeChatId);
        if (existing) return existing;
        const now = new Date().toISOString();
        const session: CanvasAssistantSession = { id: uid("chat"), title: "新对话", messages: [], agentState: createCanvasAgentState(), protocolMessages: [], createdAt: now, updatedAt: now };
        setSessions((current) => [session, ...current]);
        setActiveChatId(session.id);
        return session;
    }, [sessions, activeChatId]);

    const patchSession = useCallback((sessionId: string, patch: (session: CanvasAssistantSession) => CanvasAssistantSession) => {
        setSessions((current) => current.map((session) => (session.id === sessionId ? { ...patch(session), updatedAt: new Date().toISOString() } : session)));
    }, []);

    const run = useCallback(async (userText: string) => {
        if (!userText.trim() || running) return;
        const session = ensureSession();
        const userMessage: CanvasAssistantMessage = { id: uid("msg"), role: "user", text: userText.trim(), references: [] };
        const assistantMessage: CanvasAssistantMessage = { id: uid("msg"), role: "assistant", text: "", status: "thinking" };
        patchSession(session.id, (s) => ({ ...s, title: s.messages.length ? s.title : userText.trim().slice(0, 24), messages: [...s.messages, userMessage, assistantMessage] }));
        setPrompt("");
        setRunning(true);
        setNotice(null);
        const controller = new AbortController();
        abortRef.current = controller;

        const updateAssistant = (patch: Partial<CanvasAssistantMessage>) => {
            patchSession(session.id, (s) => ({ ...s, messages: s.messages.map((message) => (message.id === assistantMessage.id ? { ...message, ...patch } : message)) }));
        };

        try {
            const result = await runCanvasAgent({
                config: { textModel: bridge.textModel },
                initialState: active?.agentState ?? createCanvasAgentState(),
                protocolMessages: active?.protocolMessages ?? [],
                userText: userText.trim(),
                references: [],
                getContext: (state) =>
                    buildCanvasAgentContext({
                        projectId: bridge.projectId,
                        projectTitle: bridge.projectTitle,
                        nodes: bridge.nodes,
                        connections: bridge.connections,
                        selectedNodeIds: bridge.selectedIds,
                        agentState: state,
                        imageModelCode: bridge.imageModelCode,
                        videoModelCode: bridge.videoModelCode,
                        imageDefaults: bridge.imageDefaults,
                        videoDefaults: bridge.videoDefaults,
                        autoGenerateMedia: true,
                    }),
                executeAction: bridge.executeAction,
                signal: controller.signal,
                onEvent: (event) => updateAssistant({ status: event.status, activity: event.label }),
                onCheckpoint: (checkpoint) => patchSession(session.id, (s) => ({ ...s, agentState: checkpoint.state, protocolMessages: checkpoint.protocolMessages })),
            });
            updateAssistant({ text: result.reply, status: "success", activity: undefined });
            patchSession(session.id, (s) => ({ ...s, agentState: result.state, protocolMessages: result.protocolMessages }));
        } catch (error) {
            const message = error instanceof Error ? error.message : "对话失败";
            updateAssistant({ text: /Agent 已停止/.test(message) ? "已停止。" : message, status: "error" });
            if (!/Agent 已停止/.test(message)) setNotice(message);
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [running, ensureSession, patchSession, active, bridge]);

    if (!open) return null;

    return (
        <aside className="flex h-full w-[390px] shrink-0 flex-col border-l" style={{ background: theme.node.panel, borderColor: theme.node.stroke }} data-canvas-no-zoom>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: theme.node.stroke }}>
                <span className="flex-1 truncate text-sm font-medium" style={{ color: theme.node.text }}>{active?.title ?? "未命名对话"}</span>
                <button type="button" title="新对话" aria-label="新对话" className="flex size-8 items-center justify-center rounded-md transition hover:opacity-75" style={{ color: theme.node.muted }} onClick={() => { setActiveChatId(null); setPrompt(""); }}>
                    <MessageSquarePlus className="size-4" />
                </button>
                {active ? (
                    <button type="button" title="删除对话" aria-label="删除对话" className="flex size-8 items-center justify-center rounded-md transition hover:opacity-75" style={{ color: "#f87171" }} onClick={() => { setSessions((current) => current.filter((session) => session.id !== active.id)); setActiveChatId(null); }}>
                        <Trash2 className="size-4" />
                    </button>
                ) : null}
                <button type="button" title="收起" aria-label="收起对话面板" className="flex size-8 items-center justify-center rounded-md transition hover:opacity-75" style={{ color: theme.node.muted }} onClick={onClose}>
                    <X className="size-4" />
                </button>
            </header>

            <div ref={listRef} className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
                {!active || !active.messages.length ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                        <MessageSquarePlus className="size-8 opacity-30" style={{ color: theme.node.text }} />
                        <p className="text-sm" style={{ color: theme.node.muted }}>和 Agent 聊聊你的想法</p>
                        <p className="text-xs opacity-60" style={{ color: theme.node.muted }}>选中节点后对话，引用与上游会自动带上</p>
                    </div>
                ) : (
                    active.messages.map((message) => (
                        <div key={message.id} className={"flex flex-col gap-1 " + (message.role === "user" ? "items-end" : "items-start")}>
                            <div className={"max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-5 " + (message.role === "user" ? "rounded-br-sm" : "rounded-bl-sm")} style={{ background: message.role === "user" ? "#2f80ff" : theme.node.fill, color: message.role === "user" ? "#fff" : theme.node.text }}>
                                {message.text || (message.status ? `${message.activity ?? (message.status === "thinking" ? "正在思考" : "正在执行")}` : "")}
                                {message.status === "error" && message.text ? null : message.status && !message.text ? <span className="animate-pulse">…</span> : null}
                            </div>
                            {message.role === "assistant" && message.status === "success" && message.text ? (
                                <button type="button" className="self-start text-[11px] underline opacity-60 transition hover:opacity-100" style={{ color: theme.node.muted }} onClick={() => bridge.onInsertAsset(message)}>
                                    插入画布为便签
                                </button>
                            ) : null}
                        </div>
                    ))
                )}
                {notice ? <div className="rounded-lg border border-red-400/40 bg-red-400/10 p-2 text-[11px] text-red-300">{notice}</div> : null}
            </div>

            <div className="px-2 pb-2" onWheelCapture={(event) => event.stopPropagation()}>
                <div className="rounded-2xl border px-3 pb-2 pt-3" style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke }}>
                    <textarea
                        className="thin-scrollbar max-h-[180px] min-h-16 w-full resize-none bg-transparent text-sm leading-5 outline-none"
                        style={{ color: theme.node.text }}
                        placeholder="描述创作目标，或让我继续操作画布（@ 引用节点）"
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
                                event.preventDefault();
                                void run(prompt);
                            }
                        }}
                    />
                    <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                            <button type="button" title="上传文件" aria-label="上传文件" className="flex size-8 items-center justify-center rounded-full transition hover:opacity-75" style={{ color: theme.node.text }} onClick={bridge.onOpenUpload}>
                                <Upload className="size-4" />
                            </button>
                            <button type="button" title="我的素材" aria-label="我的素材" className="flex size-8 items-center justify-center rounded-full transition hover:opacity-75" style={{ color: theme.node.text }} onClick={() => bridge.onOpenAssets?.()}>
                                <FolderOpen className="size-4" />
                            </button>
                            <span className="text-[10px] opacity-40" style={{ color: theme.node.muted }}>
                                {availableReferences.filter((reference) => reference.active).length > 0 ? `可 @ 引用 ${availableReferences.filter((reference) => reference.active).length} 个节点` : "画布暂无可引用内容"}
                            </span>
                        </div>
                        {running ? (
                            <button type="button" aria-label="停止" className="flex size-10 items-center justify-center rounded-full text-white transition" style={{ background: theme.node.stroke }} onClick={() => abortRef.current?.abort()}>
                                <Square className="size-4 fill-current" />
                            </button>
                        ) : (
                            <button type="button" aria-label="发送" disabled={!prompt.trim()} className="flex size-10 items-center justify-center rounded-full text-white transition disabled:opacity-40" style={{ background: "#2f80ff" }} onClick={() => void run(prompt)}>
                                <ArrowUp className="size-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </aside>
    );
}

export type { CanvasAgentState };
