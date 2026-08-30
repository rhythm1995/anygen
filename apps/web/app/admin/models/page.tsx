"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, formatUsd, type AdminModelRow } from "@/lib/api";

export default function AdminModelsPage() {
  const qc = useQueryClient();
  const { data: models, isLoading } = useQuery({ queryKey: ["admin-models"], queryFn: () => api<AdminModelRow[]>("/admin/models") });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ price: number; cost: number; badge: string; enabled: boolean } | null>(null);

  const save = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/admin/models/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-models"] });
    },
  });

  const toggle = (m: AdminModelRow) =>
    save.mutate({ id: m.id, body: { enabled: !m.enabled } });

  return (
    <div>
      <h1 className="mb-1 font-dm-label text-lg font-semibold text-dm-text">模型管理</h1>
      <p className="mb-5 text-xs text-dm-text-4">面板与计价的数据源：这里的配置决定创作面板显示与扣费金额。</p>
      {isLoading ? (
        <p className="text-sm text-dm-text-3">加载中…</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-dm-text-4">
            <tr>
              <th className="px-2 py-2">类型</th><th className="px-2">模型</th><th className="px-2">badge</th>
              <th className="px-2">用户价</th><th className="px-2">成本</th><th className="px-2">毛利</th>
              <th className="px-2">状态</th><th className="px-2"></th>
            </tr>
          </thead>
          <tbody>
            {(models ?? []).map((m) => {
              const isEdit = editing === m.id;
              const gross = m.price_cents - m.provider_cost_cents;
              return (
                <tr key={m.id} className="border-t border-dm-border hover:bg-dm-surface/50">
                  <td className="px-2 py-2 text-xs text-dm-text-3">{m.creation_type}</td>
                  <td className="px-2">
                    <span className="text-dm-text">{m.display_name}</span>
                    <span className="ml-2 text-[10px] text-dm-text-4">{m.code}</span>
                  </td>
                  <td className="px-2 text-xs">{m.badge ?? "—"}</td>
                  <td className="px-2">
                    {isEdit && draft ? (
                      <input type="number" value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} className="w-16 rounded bg-dm-surface-2 px-1 py-0.5 text-dm-text" />
                    ) : formatUsd(m.price_cents)}
                  </td>
                  <td className="px-2">
                    {isEdit && draft ? (
                      <input type="number" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: Number(e.target.value) })} className="w-16 rounded bg-dm-surface-2 px-1 py-0.5 text-dm-text" />
                    ) : formatUsd(m.provider_cost_cents)}
                  </td>
                  <td className={`px-2 ${gross > 0 ? "text-dm-accent" : "text-dm-text-4"}`}>{formatUsd(gross)}</td>
                  <td className="px-2">
                    <button onClick={() => toggle(m)} className={`rounded px-2 py-0.5 text-[10px] ${m.enabled ? "bg-dm-accent-dim text-dm-accent" : "bg-dm-surface-2 text-dm-text-4"}`}>
                      {m.enabled ? "启用" : "停用"}
                    </button>
                  </td>
                  <td className="px-2">
                    {isEdit && draft ? (
                      <span className="flex gap-1">
                        <button onClick={() => save.mutate({ id: m.id, body: { price_cents: draft.price, provider_cost_cents: draft.cost } })} className="rounded bg-dm-accent px-2 py-0.5 text-[10px] text-[#04252a]">存</button>
                        <button onClick={() => setEditing(null)} className="text-dm-text-4">✕</button>
                      </span>
                    ) : (
                      <button
                        onClick={() => { setEditing(m.id); setDraft({ price: m.price_cents, cost: m.provider_cost_cents, badge: m.badge ?? "", enabled: m.enabled }); }}
                        className="text-xs text-dm-accent hover:underline"
                      >
                        改价
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
