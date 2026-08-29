"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PanelLeft, CheckCircle2, XCircle, Loader2 } from "lucide-react";

import { CreationComposer, type SubmitPayload } from "@/components/shared/creation-composer";
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

  const submit = useMutation({
    mutationFn: async (payload: SubmitPayload) => {
      let chatId = activeChat;
      if (!chatId) {
        const chat = await api<Chat>("/chats", { method: "POST", body: {} });
        chatId = chat.id;
        setActiveChat(chatId);
        qc.invalidateQueries({ queryKey: ["chats"] });
      }
      await api(`/chats/${chatId}/messages`, { method: "POST", body: { role: "user", content: payload.prompt } });
      try {
        const task = await api<GenTask>("/generation/tasks", {
          method: "POST",
          body: { type: payload.type, prompt: payload.prompt, model_code: payload.model_code, params: payload.params },
        });
        setTaskIds((prev) => [task.id, ...prev]);
        await api(`/chats/${chatId}/messages`, {
          method: "POST",
          body: { role: "assistant", content: `生成中：${payload.prompt}`, taskIds: [task.id] },
        });
      } finally {
        qc.invalidateQueries({ queryKey: ["messages", chatId] });
        qc.invalidateQueries({ queryKey: ["me"] });
      }
    },
    onError: (e) => setSubmitError((e as Error).message),
  });

  const visibleTasks = (tasks.data ?? []).filter((t) => taskIds.includes(t.id));

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
