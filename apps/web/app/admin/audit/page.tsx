"use client";

import { useQuery } from "@tanstack/react-query";

import { api, type AuditRow } from "@/lib/api";

export default function AdminAuditPage() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-audit"], queryFn: () => api<AuditRow[]>("/admin/audit?limit=200") });

  return (
    <div>
      <h1 className="mb-5 font-dm-label text-lg font-semibold text-dm-text">审计日志</h1>
      {isLoading ? (
        <p className="text-sm text-dm-text-3">加载中…</p>
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm text-dm-text-4">暂无记录（后台操作会自动落审计）</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-dm-text-4">
            <tr><th className="px-2 py-2">时间</th><th className="px-2">动作</th><th className="px-2">对象</th><th className="px-2">变更</th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((a) => (
              <tr key={a.id} className="border-t border-dm-border align-top">
                <td className="px-2 py-2 text-xs text-dm-text-3">{new Date(a.created_at).toLocaleString("zh-CN")}</td>
                <td className="px-2">
                  <span className="rounded bg-dm-accent-dim px-1.5 py-0.5 text-[10px] text-dm-accent">{a.action}</span>
                </td>
                <td className="px-2 text-xs text-dm-text-3">{a.target_table}#{String(a.target_id).slice(0, 8)}</td>
                <td className="px-2">
                  <code className="text-[11px] text-dm-text-3">{JSON.stringify(a.diff).slice(0, 120)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
