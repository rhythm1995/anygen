"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, formatUsd, type AdminUserRow } from "@/lib/api";

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const { data: users, isLoading } = useQuery({ queryKey: ["admin-users"], queryFn: () => api<AdminUserRow[]>("/admin/users") });
  const [adjusting, setAdjusting] = useState<AdminUserRow | null>(null);
  const [delta, setDelta] = useState(500);
  const [error, setError] = useState<string | null>(null);

  const adjust = useMutation({
    mutationFn: ({ id, delta_cents }: { id: string; delta_cents: number }) =>
      api(`/admin/users/${id}/adjust`, { method: "POST", body: { delta_cents } }),
    onSuccess: () => {
      setAdjusting(null);
      setError(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <div>
      <h1 className="mb-5 font-dm-label text-lg font-semibold text-dm-text">用户管理</h1>
      {isLoading ? (
        <p className="text-sm text-dm-text-3">加载中…</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-dm-text-4">
            <tr><th className="px-2 py-2">用户</th><th className="px-2">角色</th><th className="px-2">余额</th><th className="px-2">注册时间</th><th className="px-2"></th></tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id} className="border-t border-dm-border hover:bg-dm-surface/50">
                <td className="px-2 py-2">
                  <span className="text-dm-text">{u.name || "未命名"}</span>
                  <span className="ml-2 text-[10px] text-dm-text-4">{u.id.slice(0, 8)}…</span>
                </td>
                <td className="px-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] ${u.role === "admin" ? "bg-dm-accent-dim text-dm-accent" : "bg-dm-surface-2 text-dm-text-3"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-2">{formatUsd(u.balance_cents)}</td>
                <td className="px-2 text-xs text-dm-text-3">{new Date(u.created_at).toLocaleDateString("zh-CN")}</td>
                <td className="px-2">
                  {adjusting?.id === u.id ? (
                    <span className="flex items-center gap-1">
                      <input
                        type="number"
                        value={delta}
                        onChange={(e) => setDelta(Number(e.target.value))}
                        className="w-24 rounded bg-dm-surface-2 px-2 py-1 text-dm-text"
                        autoFocus
                      />
                      <button
                        onClick={() => adjust.mutate({ id: u.id, delta_cents: delta })}
                        disabled={adjust.isPending}
                        className="rounded bg-dm-accent px-2 py-1 text-[10px] text-[#04252a]"
                      >
                        确定
                      </button>
                      <button onClick={() => setAdjusting(null)} className="text-dm-text-4">✕</button>
                    </span>
                  ) : (
                    <button onClick={() => { setAdjusting(u); setDelta(500); }} className="text-xs text-dm-accent hover:underline">
                      调整余额
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}
