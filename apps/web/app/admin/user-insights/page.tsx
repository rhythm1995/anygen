"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  api,
  formatUsd,
  type InsightUserDetail,
  type InsightUserRow,
} from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  running: "生成中",
  succeeded: "成功",
  failed: "失败",
  planning: "规划中",
  awaiting_approval: "待确认",
};
const REASON_LABEL: Record<string, string> = {
  initial_grant: "初始发放",
  generation: "生成扣费",
  generation_refund: "失败退款",
  admin_adjust: "管理员调整",
  agent_step: "Agent 步骤",
};
const AGENT_STATUS_LABEL: Record<string, string> = {
  planning: "规划中",
  running: "运行中",
  awaiting_approval: "待确认",
  succeeded: "成功",
  failed: "失败",
};

const roleBadge = (role: string) =>
  role === "admin" ? "bg-dm-accent-dim text-dm-accent" : "bg-dm-surface-2 text-dm-text-3";

const fmtTime = (iso: string) => new Date(iso).toLocaleString("zh-CN", { hour12: false });

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-dm-surface p-4">
      <p className="text-xs text-dm-text-4">{label}</p>
      <p className="mt-1 font-dm-label text-xl text-dm-text">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-dm-text-4">{sub}</p>}
    </div>
  );
}

function SectionTable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-dm-label text-sm font-semibold text-dm-text">{title}</h2>
      {children}
    </section>
  );
}

const EmptyRow = ({ colSpan }: { colSpan: number }) => (
  <tr>
    <td colSpan={colSpan} className="px-2 py-4 text-center text-xs text-dm-text-4">
      暂无记录
    </td>
  </tr>
);

export default function AdminUserInsightsPage() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const list = useQuery({
    queryKey: ["admin-insights-users"],
    queryFn: () => api<InsightUserRow[]>("/admin/insights/users"),
  });
  const users = list.data ?? [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle) ||
        u.id.toLowerCase().startsWith(needle),
    );
  }, [users, q]);

  const activeId =
    selected && filtered.some((u) => u.id === selected) ? selected : (filtered[0]?.id ?? null);
  const detail = useQuery({
    queryKey: ["admin-insights-user", activeId],
    queryFn: () => api<InsightUserDetail>(`/admin/insights/users/${activeId}`),
    enabled: Boolean(activeId),
  });

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  };

  if (list.isLoading) return <p className="text-sm text-dm-text-3">加载中…</p>;
  if (list.isError) return <p className="text-xs text-red-400">{(list.error as Error).message}</p>;

  return (
    <div>
      <h1 className="mb-5 font-dm-label text-lg font-semibold text-dm-text">用户洞察</h1>
      <div className="flex items-start gap-6">
        {/* 左列：用户列表 */}
        <div className="w-[280px] shrink-0">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索名称 / 邮箱 / ID"
            className="mb-3 w-full rounded-lg border border-dm-border bg-dm-surface-2 px-3 py-2 text-xs text-dm-text placeholder:text-dm-text-4 focus:outline-none"
          />
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
            {filtered.length === 0 && <p className="px-2 py-4 text-xs text-dm-text-4">无匹配用户</p>}
            {filtered.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelected(u.id)}
                className={`mb-1 w-full rounded-lg px-3 py-2 text-left transition-colors ${
                  u.id === activeId ? "bg-dm-surface-2 text-dm-text" : "text-dm-text-3 hover:bg-dm-surface/50 hover:text-dm-text-2"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm">{u.name || u.email.split("@")[0] || "未命名"}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${roleBadge(u.role)}`}>{u.role}</span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-dm-text-4">{u.email || u.id.slice(0, 8)}</div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-dm-text-4">
                  <span>{formatUsd(u.balance_cents)}</span>
                  <span>{u.stats.tasks_total} 次生成</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 右列：360° 详情 */}
        <div className="min-w-0 flex-1">
          {detail.isLoading && <p className="text-sm text-dm-text-3">加载中…</p>}
          {detail.isError && <p className="text-xs text-red-400">{(detail.error as Error).message}</p>}
          {detail.data && (
            <>
              <div className="rounded-xl bg-dm-surface p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-dm-label text-lg font-semibold text-dm-text">
                    {detail.data.name || detail.data.email.split("@")[0] || "未命名"}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-[10px] ${roleBadge(detail.data.role)}`}>
                    {detail.data.role}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dm-text-3">
                  <span>{detail.data.email || "邮箱不可见"}</span>
                  <span className="font-mono">{detail.data.id.slice(0, 8)}…</span>
                  <button onClick={() => void copyId(detail.data.id)} className="text-dm-text-4 hover:text-dm-text-2">
                    {copied ? "已复制" : "复制 ID"}
                  </button>
                  <span>注册于 {new Date(detail.data.created_at).toLocaleDateString("zh-CN")}</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-5 gap-3">
                <StatCard label="余额" value={formatUsd(detail.data.balance_cents)} />
                <StatCard label="总支出" value={formatUsd(detail.data.stats.spend_cents)} />
                <StatCard label="累计发放" value={formatUsd(detail.data.stats.granted_cents)} sub={`退款 ${formatUsd(detail.data.stats.refund_cents)}`} />
                <StatCard
                  label="生成任务"
                  value={String(detail.data.stats.tasks_total)}
                  sub={`成功 ${detail.data.stats.tasks_succeeded} · 失败 ${detail.data.stats.tasks_failed} · 图 ${detail.data.stats.tasks_image} / 视频 ${detail.data.stats.tasks_video}`}
                />
                <StatCard label="资产" value={String(detail.data.stats.assets)} />
                <StatCard label="画布项目" value={String(detail.data.stats.projects)} />
                <StatCard label="对话" value={String(detail.data.stats.chats)} />
                <StatCard label="Agent 会话" value={String(detail.data.stats.agent_sessions)} />
                <StatCard label="Agent 花费" value={formatUsd(detail.data.stats.agent_spent_cents)} />
              </div>

              <SectionTable title="最近生成">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-dm-text-4">
                    <tr>
                      <th className="px-2 py-2">提示词</th>
                      <th className="px-2">类型</th>
                      <th className="px-2">模型</th>
                      <th className="px-2">状态</th>
                      <th className="px-2">费用</th>
                      <th className="px-2">时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.data.recent_tasks.length === 0 && <EmptyRow colSpan={6} />}
                    {detail.data.recent_tasks.map((t) => (
                      <tr key={t.id} className="border-t border-dm-border hover:bg-dm-surface/50">
                        <td className="max-w-[280px] truncate px-2 py-2 text-dm-text-2" title={t.prompt}>
                          {t.prompt}
                        </td>
                        <td className="px-2 text-dm-text-3">{t.type === "image" ? "图片" : "视频"}</td>
                        <td className="px-2 text-dm-text-3">{t.model_code}</td>
                        <td className={`px-2 ${t.status === "succeeded" ? "text-dm-accent" : t.status === "failed" ? "text-red-400" : "text-dm-text-3"}`}>
                          {STATUS_LABEL[t.status] ?? t.status}
                        </td>
                        <td className="px-2">{formatUsd(t.cost_cents)}</td>
                        <td className="px-2 text-xs text-dm-text-4">{fmtTime(t.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SectionTable>

              <SectionTable title="最近账变">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-dm-text-4">
                    <tr>
                      <th className="px-2 py-2">类型</th>
                      <th className="px-2">金额</th>
                      <th className="px-2">之后余额</th>
                      <th className="px-2">时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.data.recent_ledger.length === 0 && <EmptyRow colSpan={4} />}
                    {detail.data.recent_ledger.map((l) => (
                      <tr key={l.id} className="border-t border-dm-border hover:bg-dm-surface/50">
                        <td className="px-2 py-2 text-dm-text-2">{REASON_LABEL[l.reason] ?? l.reason}</td>
                        <td className={`px-2 ${l.cents >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {l.cents >= 0 ? "+" : ""}
                          {formatUsd(l.cents)}
                        </td>
                        <td className="px-2">{formatUsd(l.balance_after_cents)}</td>
                        <td className="px-2 text-xs text-dm-text-4">{fmtTime(l.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SectionTable>

              <SectionTable title="最近 Agent 会话">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-dm-text-4">
                    <tr>
                      <th className="px-2 py-2">技能</th>
                      <th className="px-2">指令</th>
                      <th className="px-2">状态</th>
                      <th className="px-2">花费 / 预算</th>
                      <th className="px-2">时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.data.recent_agent_sessions.length === 0 && <EmptyRow colSpan={5} />}
                    {detail.data.recent_agent_sessions.map((s) => (
                      <tr key={s.id} className="border-t border-dm-border hover:bg-dm-surface/50">
                        <td className="px-2 py-2 text-dm-text-3">{s.skill_id || "自由 Agent"}</td>
                        <td className="max-w-[280px] truncate px-2 text-dm-text-2" title={s.prompt}>
                          {s.prompt}
                        </td>
                        <td className={`px-2 ${s.status === "succeeded" ? "text-dm-accent" : s.status === "failed" ? "text-red-400" : "text-dm-text-3"}`}>
                          {AGENT_STATUS_LABEL[s.status] ?? s.status}
                        </td>
                        <td className="px-2">
                          {formatUsd(s.spent_cents)} / {formatUsd(s.budget_cents)}
                        </td>
                        <td className="px-2 text-xs text-dm-text-4">{fmtTime(s.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SectionTable>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
