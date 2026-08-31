"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  FolderClosed,
  Info,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  RefreshCw,
  Search,
  SquarePen,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  CreationComposer,
  type AgentSubmitPayload,
  type ComposerPrefill,
} from "@/components/shared/creation-composer";
import { useAuth } from "@/components/providers";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, formatUsd, type AssetRow, type Chat, type ChatMessage, type CreationType, type CreationTypesConfig, type GenTask } from "@/lib/api";

// ---------- 模板卡片（封面裁自原站截图：dreamina-clone/RECON/jimeng-cn/template-covers/） ----------

const TEMPLATES = [
  {
    cover: "/templates/product-scene.png",
    title: "商品图场景合成",
    prompt: "商品图场景合成：暖金光影搭配天然石材布景，快速打造奢华、自然的高端产品大片。",
  },
  {
    cover: "/templates/jewel-portrait.png",
    title: "镜面珠宝人像摄影",
    prompt: "镜面珠宝人像摄影：纯白背景搭配专业美妆平光，呈现真实细腻的肤质与产品使用瞬间。",
  },
  {
    cover: "/templates/minimal-headset.png",
    title: "极简耳机海报",
    prompt: "极简耳机海报：黑灰极简视觉融合悬浮产品与毛玻璃 UI，打造高端科技品牌海报。",
  },
];

// 占位格渐变色相（对齐原站 "智能创意中" 四联格的蓝/暖/粉/青）
const TILE_HUES = [215, 18, 330, 195, 262, 140];

function ratioAspect(ratio: unknown): number {
  if (typeof ratio !== "string" || !ratio.includes(":")) return 1;
  const [w, h] = ratio.split(":").map(Number);
  if (!w || !h) return 1;
  return w / h;
}

function tileGradient(index: number): string {
  const h = TILE_HUES[index % TILE_HUES.length];
  return `linear-gradient(135deg, hsl(${h} 22% 14%), hsl(${(h + 35) % 360} 20% 32%), hsl(${(h + 340) % 360} 18% 22%))`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (startOf(now) - startOf(d)) / 86_400_000;
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// ---------- 对话侧栏（原站「开启创作」面板） ----------

function ChatPanel({
  chats,
  activeChat,
  onSelect,
  onNew,
}: {
  chats: Chat[];
  activeChat: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <aside className="hidden w-[240px] shrink-0 flex-col border-r border-dm-border px-3 py-4 lg:flex">
      <div className="mb-4 flex items-center justify-between px-1">
        <h2 className="font-dm-label text-[15px] font-medium text-dm-text">开启创作</h2>
        <PanelLeft size={15} className="text-dm-text-4" />
      </div>
      <button
        onClick={onNew}
        data-testid="new-chat"
        className="flex h-10 items-center gap-2 rounded-lg bg-dm-surface-2 px-3 text-sm text-dm-text transition-colors hover:bg-dm-border"
      >
        <SquarePen size={15} />
        新对话
      </button>
      <div className="mt-3 flex-1 space-y-0.5 overflow-y-auto">
        {chats.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
              activeChat === c.id ? "bg-dm-surface-2 text-dm-text" : "text-dm-text-2 hover:bg-dm-surface"
            }`}
          >
            <MessageSquare size={14} className="shrink-0 text-dm-text-4" />
            <span className="truncate">{c.title}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

// ---------- 结果流筛选栏（原站右上：搜索 | 时间 | 生成模式 | 操作类型 | 资产库） ----------

export interface FeedFilter {
  sort: "newest" | "oldest";
  mode: "all" | "image" | "video";
  op: "all" | "gen" | "agent";
  q: string;
}

function FilterTrigger({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      <ChevronDown size={13} className="text-dm-text-3" />
    </span>
  );
}

function FilterBar({ filter, onChange }: { filter: FeedFilter; onChange: (f: FeedFilter) => void }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const triggerCls =
    "flex items-center px-4 text-sm text-dm-text transition-colors hover:bg-dm-surface-2 data-[state=open]:bg-dm-surface-2";
  return (
    <div className="flex h-11 items-stretch overflow-hidden rounded-xl border border-dm-border bg-dm-surface">
      <button
        aria-label="搜索"
        onClick={() => setSearchOpen((v) => !v)}
        className="flex items-center px-3.5 text-dm-text transition-colors hover:bg-dm-surface-2"
      >
        <Search size={16} />
      </button>
      {searchOpen && (
        <input
          autoFocus
          value={filter.q}
          onChange={(e) => onChange({ ...filter, q: e.target.value })}
          placeholder="搜索提示词"
          className="w-36 bg-transparent pr-2 text-sm text-dm-text outline-none placeholder:text-dm-text-4"
        />
      )}
      <span className="my-2.5 w-px bg-dm-border-2" />
      <DropdownMenu>
        <DropdownMenuTrigger className={triggerCls}>
          <FilterTrigger label={filter.sort === "newest" ? "时间" : "时间 · 最早"} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="border-dm-border bg-dm-surface">
          <DropdownMenuRadioGroup
            value={filter.sort}
            onValueChange={(v) => onChange({ ...filter, sort: v as FeedFilter["sort"] })}
          >
            <DropdownMenuRadioItem value="newest">最新优先</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="oldest">最早优先</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="my-2.5 w-px bg-dm-border-2" />
      <DropdownMenu>
        <DropdownMenuTrigger className={triggerCls}>
          <FilterTrigger label={filter.mode === "all" ? "生成模式" : filter.mode === "image" ? "图片" : "视频"} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="border-dm-border bg-dm-surface">
          <DropdownMenuRadioGroup
            value={filter.mode}
            onValueChange={(v) => onChange({ ...filter, mode: v as FeedFilter["mode"] })}
          >
            <DropdownMenuRadioItem value="all">全部模式</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="image">图片生成</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="video">视频生成</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="my-2.5 w-px bg-dm-border-2" />
      <DropdownMenu>
        <DropdownMenuTrigger className={triggerCls}>
          <FilterTrigger label={filter.op === "all" ? "操作类型" : filter.op === "gen" ? "生成" : "Agent 执行"} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="border-dm-border bg-dm-surface">
          <DropdownMenuRadioGroup
            value={filter.op}
            onValueChange={(v) => onChange({ ...filter, op: v as FeedFilter["op"] })}
          >
            <DropdownMenuRadioItem value="all">全部操作</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="gen">生成</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="agent">Agent 执行</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="my-2.5 w-px bg-dm-border-2" />
      <a
        href="/ai-tool/assets"
        className="flex items-center gap-1.5 px-4 text-sm text-dm-text transition-colors hover:bg-dm-surface-2"
      >
        <FolderClosed size={15} />
        资产库
      </a>
    </div>
  );
}

// ---------- 生成中的占位格（模糊渐变 + 首格百分比） ----------

function PlaceholderTile({ index, ratio, showPct, pct }: { index: number; ratio: number; showPct: boolean; pct: number }) {
  return (
    <div
      className="dm-tile-loading relative overflow-hidden rounded-lg"
      style={{ aspectRatio: String(ratio), background: tileGradient(index) }}
      data-testid={index === 0 ? "gen-placeholder" : undefined}
    >
      {showPct && (
        <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 font-dm-label text-[11px] text-white backdrop-blur">
          {pct}%
        </span>
      )}
    </div>
  );
}

// ---------- 单次生成组（提示词 + 元信息 + 四联格 + 操作按钮） ----------

function TaskGroup({
  task,
  assetMap,
  onEdit,
  onRegenerate,
}: {
  task: GenTask;
  assetMap: Map<string, AssetRow>;
  onEdit: (t: GenTask) => void;
  onRegenerate: (t: GenTask) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const p = (task.params ?? {}) as Record<string, unknown>;
  const ratio = typeof p.ratio === "string" ? p.ratio : "1:1";
  const res = typeof p.resolution === "string" ? p.resolution.toUpperCase() : "";
  const count = typeof p.count === "number" ? p.count : 1;
  const modelName = typeof p.model_name === "string" ? p.model_name : task.model_code;
  const running = task.status === "queued" || task.status === "running";

  // 生成中百分比：按已用时模拟（原站同为客户端假进度），封顶 95% 等真实完成
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    const started = new Date(task.createdAt).getTime();
    const t = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - started) / 1000))), 400);
    return () => clearInterval(t);
  }, [running, task.createdAt]);
  const pct = Math.min(95, Math.floor((elapsed / 12) * 100));

  const outputs = task.outputs ?? [];
  const assets = outputs.map((id) => assetMap.get(id));

  const copyPrompt = () => {
    void navigator.clipboard.writeText(task.prompt).then(() => toast("提示词已复制"));
  };

  return (
    <div className="py-5" data-testid="task-group" data-status={task.status}>
      <p className="text-[15px] leading-relaxed text-dm-text">
        <span className="line-clamp-2">{task.prompt}</span>
        <span className="ml-0 whitespace-nowrap text-[13px] text-dm-text-4">
          {" "}
          {modelName}
          {ratio ? ` | ${ratio}` : ""}
          {res ? ` | ${res}` : ""}
          {" | "}
          <button className="inline-flex items-center gap-0.5 hover:text-dm-text-2" onClick={() => setDetailOpen(true)}>
            详细信息 <Info size={12} />
          </button>
        </span>
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {running &&
          Array.from({ length: count }).map((_, i) => (
            <PlaceholderTile key={i} index={i} ratio={ratioAspect(ratio)} showPct={i === 0} pct={pct} />
          ))}
        {task.status === "succeeded" &&
          assets.map((a, i) =>
            a ? (
              <div key={a.id ?? i} className="relative overflow-hidden rounded-lg" style={{ aspectRatio: String(ratioAspect(ratio)) }}>
                {a.mime.startsWith("video") ? (
                  <video src={a.url} controls preload="metadata" className="h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={task.prompt.slice(0, 40)} className="h-full w-full object-cover" />
                )}
                {!a.mime.startsWith("video") && (
                  <span className="absolute left-2 top-2 rounded-md bg-black/55 px-2 py-1 text-[11px] text-white backdrop-blur">
                    AI 生成
                  </span>
                )}
              </div>
            ) : (
              <div
                key={`missing-${i}`}
                className="flex items-center justify-center rounded-lg border border-dm-border bg-dm-surface text-xs text-dm-text-4"
                style={{ aspectRatio: String(ratioAspect(ratio)) }}
              >
                素材已删除
              </div>
            ),
          )}
        {task.status === "failed" && (
          <div className="col-span-full flex items-center gap-2 rounded-lg border border-dm-border bg-dm-surface px-4 py-3 text-sm text-dm-text-2">
            <XCircle size={15} className="shrink-0 text-red-400" />
            生成失败：{task.error ?? "未知错误"}（费用已退回）
          </div>
        )}
      </div>

      {!running && (
        <div className="mt-4 flex items-center gap-2.5">
          {task.status === "succeeded" && (
            <button
              onClick={() => onEdit(task)}
              className="flex h-10 items-center gap-2 rounded-lg bg-dm-raised px-4 text-sm text-dm-text transition-colors hover:bg-dm-surface-2"
            >
              <SquarePen size={15} />
              重新编辑
            </button>
          )}
          <button
            onClick={() => onRegenerate(task)}
            className="flex h-10 items-center gap-2 rounded-lg bg-dm-raised px-4 text-sm text-dm-text transition-colors hover:bg-dm-surface-2"
          >
            <RefreshCw size={15} />
            再次生成
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="更多操作"
              className="flex h-10 items-center rounded-lg bg-dm-raised px-3 text-sm text-dm-text transition-colors hover:bg-dm-surface-2"
            >
              <MoreHorizontal size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="border-dm-border bg-dm-surface">
              <button
                onClick={copyPrompt}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-dm-text-2 hover:bg-dm-surface-2"
              >
                复制提示词
              </button>
              {assets.filter(Boolean).map((a) => (
                <a
                  key={a!.id}
                  href={a!.url}
                  download
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-dm-text-2 hover:bg-dm-surface-2"
                >
                  <Download size={14} />
                  下载{assets.length > 1 ? `（第 ${assets.indexOf(a) + 1} 张）` : ""}
                </a>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="border-dm-border bg-dm-surface sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="font-dm-label">详细信息</DialogTitle>
          </DialogHeader>
          <dl className="space-y-2.5 text-sm">
            {[
              ["提示词", task.prompt],
              ["模型", modelName],
              ["比例", ratio],
              ["分辨率", res || "—"],
              ["数量", String(count)],
              ["消耗", formatUsd(task.cost_cents ?? 0)],
              ["状态", task.status],
              ["创建时间", new Date(task.createdAt).toLocaleString("zh-CN")],
              ["任务 ID", task.id],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-4">
                <dt className="w-16 shrink-0 text-dm-text-4">{k}</dt>
                <dd className="break-all text-dm-text-2">{v}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Agent 会话卡（技能模板 / 自由 loop） ----------

interface AgentSessionView {
  id: string;
  status: string;
  budget_cents: number;
  spent_cents: number;
  summary: string;
  steps: { id: string; seq: number; title: string; status: string; error: string | null; asset_id: string | null; cost_cents: number }[];
}

function AgentCard({ session }: { session: AgentSessionView }) {
  return (
    <div className="rounded-xl border border-dm-border bg-dm-surface p-4" data-testid="agent-session">
      <div className="flex items-center gap-2">
        <span className="font-dm-label text-sm text-dm-text">Agent 执行</span>
        <span className="rounded bg-dm-accent-dim px-1.5 py-0.5 text-[10px] text-dm-accent">{session.status}</span>
        <span className="ml-auto text-[10px] text-dm-text-4">
          {session.spent_cents > 0
            ? `已消耗 ${formatUsd(session.spent_cents)} / 预算 ${formatUsd(session.budget_cents)}`
            : `预算 ${formatUsd(session.budget_cents)}`}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {session.steps.map((st) => (
          <div key={st.id} className="flex items-center gap-2 text-xs">
            <span className="w-5 text-dm-text-4">{st.seq}</span>
            <span className="flex-1 text-dm-text-2">{st.title}</span>
            {st.status === "succeeded" && <CheckCircle2 size={13} className="text-dm-accent" />}
            {st.status === "failed" && <XCircle size={13} className="text-red-400" />}
            {(st.status === "pending" || st.status === "running") && (
              <Loader2 size={13} className="animate-spin text-dm-text-4" />
            )}
            <span className="w-16 text-right text-[10px] text-dm-text-4">{st.status}</span>
          </div>
        ))}
      </div>
      {session.summary && <p className="mt-2 text-xs text-dm-text-3">{session.summary}</p>}
    </div>
  );
}

// ---------- 页面 ----------

// ---------- 提交后、任务落库前的乐观占位组（对齐原站：提交立刻进结果流 "智能创意中"） ----------

function OptimisticGroup({
  payload,
  modelName,
  onAbort,
}: {
  payload: AgentSubmitPayload;
  modelName: string;
  onAbort: () => void;
}) {
  const p = (payload.params ?? {}) as Record<string, unknown>;
  const ratio = typeof p.ratio === "string" ? p.ratio : "1:1";
  const res = typeof p.resolution === "string" ? p.resolution.toUpperCase() : "";
  const count = typeof p.count === "number" ? p.count : 1;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 0.4), 400);
    return () => clearInterval(t);
  }, []);
  const pct = Math.min(95, Math.floor((elapsed / 12) * 100));
  return (
    <div className="py-5" data-testid="optimistic-group">
      <p className="text-[15px] leading-relaxed text-dm-text">
        <span className="line-clamp-2">{payload.prompt}</span>
        <span className="ml-0 whitespace-nowrap text-[13px] text-dm-text-4">
          {" "}
          {modelName}
          {ratio ? ` | ${ratio}` : ""}
          {res ? ` | ${res}` : ""}
          {" | "}智能创意中…
        </span>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: count }).map((_, i) => (
          <PlaceholderTile key={i} index={i} ratio={ratioAspect(ratio)} showPct={i === 0} pct={pct} />
        ))}
      </div>
    </div>
  );
}

export default function GeneratePage() {
  const { session, loading } = useAuth();
  const qc = useQueryClient();
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [liveTaskIds, setLiveTaskIds] = useState<string[]>([]);
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null);
  const [freeRunning, setFreeRunning] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false); // 提交过即进入结果流视图
  const [composing, setComposing] = useState(false); // 结果流中展开 composer
  const [prefill, setPrefill] = useState<ComposerPrefill | null>(null);
  const [optimistic, setOptimistic] = useState<(AgentSubmitPayload & { at: number }) | null>(null);
  const [filter, setFilter] = useState<FeedFilter>({ sort: "newest", mode: "all", op: "all", q: "" });

  const chats = useQuery({ queryKey: ["chats"], queryFn: () => api<Chat[]>("/chats"), enabled: Boolean(session) });
  const messages = useQuery({
    queryKey: ["messages", activeChat],
    enabled: Boolean(activeChat),
    queryFn: () => api<ChatMessage[]>(`/chats/${activeChat}/messages`),
  });
  const tasks = useQuery({
    queryKey: ["tasks"],
    enabled: Boolean(session),
    queryFn: async () => {
      const list = await api<GenTask[]>("/generation/tasks");
      const active = list.filter((t) => t.status === "running" || t.status === "queued");
      if (active.length === 0) return list;
      // GET :id 即触发服务端向 provider 轮询，再取一次最新列表
      await Promise.all(active.map((t) => api(`/generation/tasks/${t.id}`).catch(() => undefined)));
      return api<GenTask[]>("/generation/tasks");
    },
    refetchInterval: (q) =>
      q.state.data?.some((t) => t.status === "running" || t.status === "queued") ? 2000 : false,
  });
  const assets = useQuery({
    queryKey: ["assets-map"],
    enabled: Boolean(session),
    queryFn: () => api<AssetRow[]>("/assets?limit=200"),
    staleTime: 30_000,
    select: (rows) => new Map(rows.map((r) => [r.id, r])),
  });
  const assetMap = assets.data ?? new Map<string, AssetRow>();
  // 与 composer 共用同一缓存键：乐观组用它把 model_code 翻译成显示名
  const config = useQuery({
    queryKey: ["creation-types"],
    queryFn: () => api<CreationTypesConfig>("/config/creation-types"),
    staleTime: 5 * 60_000,
    enabled: Boolean(session),
  });

  const agentSession = useQuery({
    queryKey: ["agent-session", agentSessionId],
    enabled: Boolean(agentSessionId),
    queryFn: async () => {
      await api(`/agent/sessions/${agentSessionId}/advance`, { method: "POST" }).catch(() => undefined);
      return api<AgentSessionView>(`/agent/sessions/${agentSessionId}`);
    },
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      if (st === "running" || st === "planning") return 2500;
      return false;
    },
  });

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
        const session = await api<AgentSessionView>("/agent/sessions", {
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
        const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3101/api").replace(/\/$/, "");
        const runRes = await fetch(`${apiBase}/agent/free/sessions/${session.id}/run`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        // fetch 流式读 SSE（EventSource 无法带 Authorization 头）
        void (async () => {
          const reader = runRes.body?.getReader();
          if (!reader) {
            setFreeRunning(false);
            return;
          }
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
        setLiveTaskIds((prev) => [task.id, ...prev]);
        await api(`/chats/${chatId}/messages`, {
          method: "POST",
          body: { role: "assistant", content: `生成中：${payload.prompt}`, taskIds: [task.id] },
        });
        qc.invalidateQueries({ queryKey: ["tasks"] });
      }
      qc.invalidateQueries({ queryKey: ["messages", chatId] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => {
      setSubmitError((e as Error).message);
      toast.error((e as Error).message);
    },
  });

  const handleSubmit = (payload: AgentSubmitPayload) => {
    setSubmitError(null);
    // 提交瞬间就切结果流并显示乐观占位组（原站行为），任务落库后由真实组顶替
    if (payload.type === "image" || payload.type === "video") {
      setOptimistic({ ...payload, at: Date.now() });
    }
    setEntered(true);
    setComposing(false);
    setPrefill(null);
    submit.mutate(payload, {
      onSuccess: () => setOptimistic(null),
      onError: () => {
        setOptimistic(null);
        if (allTasks.length === 0) setEntered(false);
      },
    });
  };

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
      const payload = JSON.parse(raw) as AgentSubmitPayload;
      if (payload.type === "image" || payload.type === "video") {
        setOptimistic({ ...payload, at: Date.now() });
      }
      submit.mutate(payload, { onSuccess: () => setOptimistic(null) });
      setEntered(true);
    } catch {}
  }, [loading, session, submit]);

  // 资产详情「重新编辑/生成视频」跳转过来：回填 composer（不自动提交）
  const prefillConsumed = useRef(false);
  useEffect(() => {
    if (prefillConsumed.current || loading || !session) return;
    if (!new URLSearchParams(window.location.search).get("prefill")) return;
    const raw = sessionStorage.getItem("pending-prefill");
    if (!raw) return;
    prefillConsumed.current = true;
    sessionStorage.removeItem("pending-prefill");
    try {
      openComposerWith(JSON.parse(raw));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session]);

  const allTasks = tasks.data ?? [];

  // 任务先于资产列表完成时（outputs 里的 id 还不在 map 中）补拉一次资产，避免闪"素材已删除"
  const missingAsset = allTasks.some(
    (t) => t.status === "succeeded" && (t.outputs ?? []).some((id) => !assetMap.has(id)),
  );
  useEffect(() => {
    if (missingAsset && !assets.isLoading && !assets.isFetching) assets.refetch();
  }, [missingAsset, assets]);

  // 会话作用域：选中会话只看该会话引用过的任务（外加本次点击后刚建、消息还没落库的任务）
  const chatTaskIds = useMemo(
    () => (activeChat && messages.data ? new Set(messages.data.flatMap((m) => m.task_ids ?? [])) : null),
    [activeChat, messages.data],
  );
  const scopedTasks = useMemo(
    () => allTasks.filter((t) => !chatTaskIds || chatTaskIds.has(t.id) || liveTaskIds.includes(t.id)),
    [allTasks, chatTaskIds, liveTaskIds],
  );
  const filtered = useMemo(() => {
    const list = scopedTasks.filter((t) => {
      if (filter.mode !== "all" && t.type !== filter.mode) return false;
      if (filter.q && !t.prompt.toLowerCase().includes(filter.q.toLowerCase())) return false;
      return true;
    });
    list.sort((a, b) =>
      filter.sort === "newest"
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return list;
  }, [scopedTasks, filter]);

  const isEmptyState = !entered && scopedTasks.length === 0;

  const openComposerWith = (p: ComposerPrefill) => {
    setPrefill(p);
    setComposing(true);
  };
  const handleEdit = (t: GenTask) => {
    const p = { ...((t.params ?? {}) as Record<string, unknown>) };
    openComposerWith({
      type: t.type as CreationType,
      prompt: t.prompt,
      model_code: t.model_code || (typeof p.model_code === "string" ? p.model_code : undefined),
      params: p,
    });
  };
  const handleRegenerate = (t: GenTask) => {
    const p = { ...((t.params ?? {}) as Record<string, unknown>) };
    delete p.model_name;
    delete p.model_code;
    delete p.skill_id;
    setSubmitError(null);
    const payload = { type: t.type as CreationType, prompt: t.prompt, model_code: t.model_code, params: p };
    if (payload.type === "image" || payload.type === "video") {
      setOptimistic({ ...payload, at: Date.now() });
    }
    setEntered(true);
    submit.mutate(payload, { onSuccess: () => setOptimistic(null) });
  };
  const handleNewChat = () => {
    api<Chat>("/chats", { method: "POST", body: {} })
      .then((c) => {
        setActiveChat(c.id);
        qc.invalidateQueries({ queryKey: ["chats"] });
        setEntered(false);
        setComposing(true);
      })
      .catch((e) => toast.error((e as Error).message));
  };

  if (loading) return <div className="flex flex-1 items-center justify-center text-sm text-dm-text-3">加载中…</div>;

  if (!session) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <h1 className="font-dm-label text-xl text-dm-text">你好，想创作什么？</h1>
        <p className="max-w-sm text-center text-sm text-dm-text-3">在左侧登录后开始创作。</p>
      </div>
    );
  }

  // 按天分桶（今天/昨天/日期），首桶标签并入页头，其余桶渲染小标题
  const buckets: { label: string; tasks: GenTask[] }[] = [];
  for (const t of filtered) {
    const label = dayLabel(t.createdAt);
    const last = buckets[buckets.length - 1];
    if (last && last.label === label) last.tasks.push(t);
    else buckets.push({ label, tasks: [t] });
  }
  const showAgentCard = Boolean(agentSession.data) && filter.op !== "gen";
  const showTasks = filter.op !== "agent";
  // 真实任务已落库（同提示词、晚于乐观提交时刻）即不再显示乐观组
  const optimisticVisible =
    optimistic && showTasks &&
    !allTasks.some((t) => t.prompt === optimistic.prompt && new Date(t.createdAt).getTime() >= optimistic.at - 1000);
  const optimisticModelName =
    (config.data?.modelsByType[optimistic?.type ?? "image"] ?? []).find((m) => m.code === optimistic?.model_code)
      ?.display_name ?? optimistic?.model_code ?? "";

  return (
    <div className="flex min-h-screen flex-1">
      <ChatPanel
        chats={chats.data ?? []}
        activeChat={activeChat}
        onSelect={(id) => {
          setActiveChat(id);
          setEntered(false);
          setComposing(false);
        }}
        onNew={handleNewChat}
      />

      {isEmptyState ? (
        // ---------- 空态：欢迎语 + 模板卡 + 底部停靠 composer（原站截图 1:1） ----------
        <div className="relative flex min-h-screen flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center px-8" style={{ paddingTop: "18vh" }}>
            <h1 className="font-dm-label text-[26px] font-semibold text-dm-text">你好，想创作什么？</h1>
            <div className="mt-9 grid w-full max-w-[800px] grid-cols-1 gap-2 pb-10 sm:grid-cols-3">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.title}
                  onClick={() => openComposerWith({ type: "image", prompt: tpl.prompt })}
                  className="group overflow-hidden rounded-xl bg-dm-surface text-left transition-colors hover:bg-dm-surface-2"
                  aria-label={`试一试 ${tpl.title}`}
                >
                  {/* 封面含原版烘焙标题/角标；点击整卡即填入提示词 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tpl.cover} alt={tpl.title} className="block w-full" />
                  <p className="px-3.5 pb-3.5 pt-2 text-[13px] leading-relaxed text-dm-text-2">{tpl.prompt.split("：")[1]}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="px-8 pb-4">
            <div className="mx-auto w-full max-w-[800px]">
              <CreationComposer
                skillPicker
                docked
                prefill={prefill}
                onSubmit={handleSubmit}
                busy={submit.isPending}
                error={submitError}
              />
            </div>
          </div>
        </div>
      ) : (
        // ---------- 结果流：日期页头 + 筛选栏 + 生成组 ----------
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-4 bg-dm-bg/85 px-8 py-4 backdrop-blur">
            <h1 className="font-dm-label text-[24px] font-semibold text-dm-text">
              {buckets[0]?.label ?? "今天"}
            </h1>
            <FilterBar filter={filter} onChange={setFilter} />
          </header>
          <div className="mx-auto w-full max-w-[1200px] flex-1 px-8 pb-28">
            {showAgentCard && agentSession.data && (
              <div className="pt-4">
                <AgentCard session={agentSession.data} />
              </div>
            )}
            {optimisticVisible && optimistic && (
              <OptimisticGroup
                payload={optimistic}
                modelName={optimisticModelName}
                onAbort={() => {
                  setOptimistic(null);
                  if (allTasks.length === 0) setEntered(false);
                }}
              />
            )}
            {showTasks &&
              buckets.map((b, bi) => (
                <section key={`${b.label}-${bi}`}>
                  {bi > 0 && <h2 className="pt-8 font-dm-label text-lg font-semibold text-dm-text">{b.label}</h2>}
                  {b.tasks.map((t) => (
                    <TaskGroup key={t.id} task={t} assetMap={assetMap} onEdit={handleEdit} onRegenerate={handleRegenerate} />
                  ))}
                </section>
              ))}
            {buckets.length === 0 && !optimisticVisible && !showAgentCard && (
              <p className="pt-16 text-center text-sm text-dm-text-3">暂无符合条件的生成记录</p>
            )}
            {freeRunning && <p className="pt-4 text-xs text-dm-text-3">Agent 自由模式执行中…</p>}
          </div>

          {composing && (
            <div className="fixed bottom-0 left-[76px] right-0 z-30 lg:left-[316px]" data-testid="composer-overlay">
              <div className="border-t border-dm-border bg-dm-bg/95 px-6 py-3 backdrop-blur">
                <div className="mx-auto w-full max-w-[800px]">
                  <CreationComposer
                    skillPicker
                    docked
                    compact
                    prefill={prefill}
                    onSubmit={handleSubmit}
                    busy={submit.isPending}
                    error={submitError}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
