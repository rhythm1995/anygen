"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { PanelLeft, CheckCircle2, XCircle, Loader2 } from "lucide-react";

import { CreationComposer, type AgentSubmitPayload } from "@/components/shared/creation-composer";
import { useAuth } from "@/components/providers";
import { api, formatUsd, type Chat, type ChatMessage, type GenTask, type MeInfo } from "@/lib/api";

function TaskCard({ task }: { task: GenTask }) {
  const p = (task.params ?? {}) as Record<string, unknown>;
  return (
    <div className="rounded-xl border border-dm-border bg-dm-surface p-3">
      <div className="flex items-center gap-2 text-xs">
        {task.status === "succeeded" && <CheckCircle2 size={14} className="text-dm-accent" />}
        {task.status === "failed" && <XCircle size={14} className="text-red-400" />}
        {(task.status === "queued" || task.status === "running") && <Loader2 size={14} className="animate-spin text-dm-accent" />}
        <span className="font-dm-label text-dm-text-2">
          {task.type === "image" ? "图片生成" : task.type === "video" ? "视频生成" : task.type}
        </span>
        <span className="rounded bg-dm-accent-dim px-1.5 py-0.5 text-[10px] text-dm-accent">{task.status}</span>
        <span className="ml-auto text-dm-text-4">-{formatUsd(task.cost_cents ?? 0)}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-dm-text-2">{task.prompt}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {typeof p.model_name === "string" && <span className="rounded bg-dm-surface-2 px-1.5 py-0.5 text-[10px] text-dm-text-3">{p.model_name}</span>}
        {typeof p.resolution === "string" && <span className="rounded bg-dm-surface-2 px-1.5 py-0.5 text-[10px] text-dm-text-3">{p.resolution}</span>}
        {typeof p.count === "number" && <span className="rounded bg-dm-surface-2 px-1.5 py-0.5 text-[10px] text-dm-text-3">×{p.count}</span>}
        {typeof p.duration_seconds === "number" && <span className="rounded bg-dm-surface-2 px-1.5 py-0.5 text-[10px] text-dm-text-3">{p.duration_seconds}s</span>}
      </div>
      {task.status === "failed" && task.error && <p className="mt-1.5 text-xs text-red-400">{task.error}</p>}
    </div>
  );
}

function ChatList() {
  const { data: chats } = useQuery({ queryKey: ["chats"], queryFn: () => api<Chat[]>("/chats") });
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: () => api<Chat>("/chats", { method: "POST", body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chats"] }),
  });
  return (
    <aside className="hidden w-[240px] shrink-0 flex-col gap-3 border-r border-dm-border px-4 py-5 lg:flex">
      <div className="flex items-center justify-between">
        <h2 className="font-dm-label text-sm text-dm-text">会话</h2>
        <PanelLeft size={15} className="text-dm-text-4" />
      </div>
      <button
        onClick={() => create.mutate()}
        className="flex items-center gap-2 rounded-lg bg-dm-surface px-3 py-2.5 text-sm text-dm-text-2 transition-colors hover:bg-dm-surface-2"
      >
        <span className="text-dm-accent">＋</span> 新建会话
      </button>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {(chats ?? []).map((c) => (
          <button key={c.id} className="w-full truncate rounded-lg px-3 py-2 text-left text-sm text-dm-text-2 hover:bg-dm-surface">
            {c.title}
          </button>
        ))}
      </div>
    </aside>
  );
}

export default function GeneratePage() {
  const { session, me, loading } = useAuth();
  const qc = useQueryClient();
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null);
  const [freeRunning, setFreeRunning] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const messages = useQuery({
    queryKey: ["messages", activeChat],
    enabled: Boolean(activeChat),
    queryFn: () => api<ChatMessage[]>(`/chats/${activeChat}/messages`),
  });

  const tasks = useQuery({
    queryKey: ["tasks", taskIds],
    enabled: taskIds.length > 0,
    queryFn: () => api<GenTask[]>("/generation/tasks"),
    refetchInterval: (q) =>
      q.state.data?.some((t) => t.status === "running" || t.status === "queued") ? 2000 : false,
  });

  interface AgentSession {
    id: string;
    status: string;
    budget_cents: number;
    spent_cents: number;
    summary: string;
    steps: { id: string; seq: number; title: string; status: string; error: string | null; asset_id: string | null; cost_cents: number }[];
  }

  const submit = useMutation({
    mutationFn: async (payload: AgentSubmitPayload) => {
      let chatId = activeChat;
      if (!chatId) {
        const chat = await api<Chat>("/chats", { method: "POST", body: {} });
        chatId = chat.id;
        setActiveChat(chatId);
        qc.invalidateQueries({ queryKey: ["chats"] });
      }
      await api(`/chats/${chatId}/messages`, { method: "POST", body: { role: "user", content: payload.prompt } });

      if (payload.type === "agent" && payload.skill_id) {
        // Agent v1：技能模板执行器
        const session = await api<AgentSession>("/agent/sessions", {
          method: "POST",
          body: { skill_id: payload.skill_id, prompt: payload.prompt },
        });
        setAgentSessionId(session.id);
        await api(`/chats/${chatId}/messages`, {
          method: "POST",
          body: { role: "assistant", content: `已启动技能执行：${payload.prompt}` },
        });
      } else if (payload.type === "agent") {
        // Agent v2：自由 loop（SSE）
        const session = await api<{ id: string }>("/agent/free/sessions", {
          method: "POST",
          body: { prompt: payload.prompt },
        });
        setAgentSessionId(session.id);
        setFreeRunning(true);
        const token = (await (await import("@/lib/supabase")).supabase.auth.getSession()).data.session?.access_token;
        const runRes = await fetch(`http://127.0.0.1:3101/api/agent/free/sessions/${session.id}/run`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        // fetch 流式读 SSE（EventSource 无法带 Authorization 头）
        void (async () => {
          const reader = runRes.body?.getReader();
          if (!reader) { setFreeRunning(false); return; }
          const decoder = new TextDecoder();
          let buf = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buf.indexOf("\n\n")) >= 0) {
              const chunk = buf.slice(0, idx);
              buf = buf.slice(idx + 2);
              if (chunk.startsWith("event: end") || chunk.startsWith("event: error")) {
                reader.cancel().catch(() => undefined);
                setFreeRunning(false);
                qc.invalidateQueries({ queryKey: ["agent-session", session.id] });
                qc.invalidateQueries({ queryKey: ["me"] });
              }
            }
          }
          setFreeRunning(false);
        })();
        await api(`/chats/${chatId}/messages`, {
          method: "POST",
          body: { role: "assistant", content: `Agent 自由模式启动：${payload.prompt}` },
        });
      } else {
        const task = await api<GenTask>("/generation/tasks", {
          method: "POST",
          body: { type: payload.type, prompt: payload.prompt, model_code: payload.model_code, params: payload.params },
        });
        setTaskIds((prev) => [task.id, ...prev]);
        await api(`/chats/${chatId}/messages`, {
          method: "POST",
          body: { role: "assistant", content: `生成中：${payload.prompt}`, taskIds: [task.id] },
        });
      }
      qc.invalidateQueries({ queryKey: ["messages", chatId] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => setSubmitError((e as Error).message),
  });

  // 首页/画布提交跳转过来：自动消费暂存的生成请求（仅登录态执行一次）
  const autoConsumed = useRef(false);
  useEffect(() => {
    if (autoConsumed.current || loading || !session) return;
    if (!new URLSearchParams(window.location.search).get("auto")) return;
    const raw = sessionStorage.getItem("pending-generation");
    if (!raw) return;
    autoConsumed.current = true;
    sessionStorage.removeItem("pending-generation");
    try {
      submit.mutate(JSON.parse(raw));
    } catch {}
  }, [loading, session, submit]);

  const visibleTasks = (tasks.data ?? []).filter((t) => taskIds.includes(t.id));

  // Agent 会话轮询（advance 推进执行器 + 拉取步骤）
  const agentSession = useQuery({
    queryKey: ["agent-session", agentSessionId],
    enabled: Boolean(agentSessionId),
    queryFn: async () => {
      await api(`/agent/sessions/${agentSessionId}/advance`, { method: "POST" }).catch(() => undefined);
      return api<AgentSession>(`/agent/sessions/${agentSessionId}`);
    },
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      if (st === "running" || st === "planning") return 2500;
      return false;
    },
  });

  if (loading) return <div className="flex flex-1 items-center justify-center text-sm text-dm-text-3">加载中…</div>;

  if (!session) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <h1 className="font-dm-label text-xl text-dm-text">今天想创作点什么？</h1>
        <p className="max-w-sm text-center text-sm text-dm-text-3">在左侧登录后开始创作。</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-1">
      <ChatList />
      <div className="flex flex-1 flex-col items-center px-8 pt-16">
        <h1 className="mb-8 font-dm-label text-[26px] font-semibold text-dm-text">今天想创作点什么？</h1>
        <div className="w-full max-w-[780px] space-y-4">
          <CreationComposer
            skillPicker
            onSubmit={(payload) => {
              setSubmitError(null);
              submit.mutate(payload);
            }}
            busy={submit.isPending}
            error={submitError}
          />
          {me && (
            <p className="text-center text-xs text-dm-text-4">
              余额 {formatUsd(me.balance_cents ?? 0)} · 图片/视频按模型计价 · 无 ARK_API_KEY 时生成不可用
            </p>
          )}
          {visibleTasks.length > 0 && (
            <div className="space-y-2">
              {visibleTasks.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          )}
          {agentSession.data && (
            <div className="rounded-xl border border-dm-border bg-dm-surface p-4" data-testid="agent-session">
              <div className="flex items-center gap-2">
                <span className="font-dm-label text-sm text-dm-text">技能执行</span>
                <span className="rounded bg-dm-accent-dim px-1.5 py-0.5 text-[10px] text-dm-accent">
                  {(agentSession.data as { status: string }).status}
                </span>
                <span className="ml-auto text-[10px] text-dm-text-4">
                  {(agentSession.data as { spent_cents: number }).spent_cents > 0
                    ? `已消耗 ${formatUsd((agentSession.data as { spent_cents: number }).spent_cents)} / 预算 ${formatUsd((agentSession.data as { budget_cents: number }).budget_cents)}`
                    : `预算 ${formatUsd((agentSession.data as { budget_cents: number }).budget_cents)}`}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {(agentSession.data as { steps: any[] }).steps.map((st) => (
                  <div key={st.id} className="flex items-center gap-2 text-xs">
                    <span className="w-5 text-dm-text-4">{st.seq}</span>
                    <span className="flex-1 text-dm-text-2">{st.title}</span>
                    {st.status === "succeeded" && <CheckCircle2 size={13} className="text-dm-accent" />}
                    {st.status === "failed" && <XCircle size={13} className="text-red-400" />}
                    {(st.status === "pending" || st.status === "running") && <Loader2 size={13} className="animate-spin text-dm-text-4" />}
                    <span className="w-16 text-right text-[10px] text-dm-text-4">{st.status}</span>
                  </div>
                ))}
              </div>
              {(agentSession.data as { summary: string }).summary && (
                <p className="mt-2 text-xs text-dm-text-3">{(agentSession.data as { summary: string }).summary}</p>
              )}
            </div>
          )}
          {messages.data && messages.data.length > 0 && (
            <div className="space-y-2 pb-16 pt-4">
              {[...messages.data].reverse().map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm ${
                    m.role === "user" ? "ml-auto bg-dm-surface-2 text-dm-text" : "bg-dm-surface text-dm-text-2"
                  }`}
                >
                  {m.content}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
