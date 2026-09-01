"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, formatUsd, type AdminModelRow } from "@/lib/api";

export default function AdminPricingPage() {
  const qc = useQueryClient();
  const models = useQuery({ queryKey: ["admin-models"], queryFn: () => api<AdminModelRow[]>("/admin/models") });
  const settings = useQuery({ queryKey: ["admin-settings"], queryFn: () => api<Record<string, unknown>>("/admin/settings") });
  const grant = Number(settings.data?.initial_grant_cents ?? 500);
  const [draftGrant, setDraftGrant] = useState<number | null>(null);
  const saveGrant = useMutation({
    mutationFn: (cents: number) => api("/admin/settings", { method: "PATCH", body: { initial_grant_cents: cents } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-settings"] }),
  });
  const byUnit = new Map<string, AdminModelRow[]>();
  for (const m of models.data ?? []) {
    const list = byUnit.get(m.unit_type) ?? [];
    list.push(m);
    byUnit.set(m.unit_type, list);
  }

  return (
    <div>
      <h1 className="mb-1 font-dm-label text-lg font-semibold text-dm-text">定价</h1>
      <p className="mb-5 text-xs text-dm-text-4">三类口径单价来自 models 表；改价请到「模型」。此处调整新用户 initial_grant。</p>
      <div className="mb-6 rounded-xl bg-dm-surface p-4">
        <p className="text-xs text-dm-text-4">新用户初始赠金</p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            value={draftGrant ?? grant}
            onChange={(e) => setDraftGrant(Number(e.target.value))}
            className="w-28 rounded-lg bg-dm-raised px-2 py-1 text-sm text-dm-text"
          />
          <span className="text-xs text-dm-text-3">{formatUsd(draftGrant ?? grant)}</span>
          <button
            type="button"
            className="rounded-lg bg-dm-accent px-3 py-1 text-xs text-[#04252a]"
            onClick={() => saveGrant.mutate(draftGrant ?? grant)}
          >
            保存
          </button>
        </div>
      </div>
      {[...byUnit.entries()].map(([unit, rows]) => (
        <div key={unit} className="mb-6">
          <h2 className="mb-2 text-sm text-dm-text-2">{unit}</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-dm-text-4">
              <tr><th className="px-2 py-1">模型</th><th className="px-2">用户价</th><th className="px-2">成本</th></tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-t border-dm-border">
                  <td className="px-2 py-2 text-dm-text">{m.display_name}</td>
                  <td className="px-2">{formatUsd(m.price_cents)}</td>
                  <td className="px-2 text-dm-text-3">{formatUsd(m.provider_cost_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
