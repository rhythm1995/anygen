"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/lib/api";

interface ProviderRow {
  id: string;
  name: string;
  protocol: string;
  base_url: string;
  enabled: boolean;
}
interface KeyRow {
  id: string;
  secret_hint: string;
  enabled: boolean;
  created_at: string;
}

export default function AdminProvidersPage() {
  const qc = useQueryClient();
  const { data: providers, isLoading } = useQuery({ queryKey: ["admin-providers"], queryFn: () => api<ProviderRow[]>("/admin/providers") });
  const [openId, setOpenId] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const keys = useQuery({
    queryKey: ["admin-keys", openId],
    queryFn: () => api<KeyRow[]>(`/admin/providers/${openId}/keys`),
    enabled: Boolean(openId),
  });
  const addKey = useMutation({
    mutationFn: () => api(`/admin/providers/${openId}/keys`, { method: "POST", body: { secret } }),
    onSuccess: () => {
      setSecret("");
      qc.invalidateQueries({ queryKey: ["admin-keys", openId] });
    },
  });
  const toggleKey = useMutation({
    mutationFn: (row: KeyRow) => api(`/admin/providers/${openId}/keys/${row.id}`, { method: "PATCH", body: { enabled: !row.enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-keys", openId] }),
  });

  return (
    <div>
      <h1 className="mb-1 font-dm-label text-lg font-semibold text-dm-text">供应商与密钥</h1>
      <p className="mb-5 text-xs text-dm-text-4">密钥 AES 加密入库，列表只显示尾 4 位。未填时生成回退环境变量。</p>
      {isLoading ? <p className="text-sm text-dm-text-3">加载中…</p> : (
        <div className="space-y-2">
          {(providers ?? []).map((p) => (
            <div key={p.id} className="rounded-xl border border-dm-border bg-dm-surface p-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-dm-text">{p.name}</span>
                <span className="text-[10px] text-dm-text-4">{p.protocol}</span>
                <span className="text-[10px] text-dm-text-4">{p.base_url}</span>
                <div className="flex-1" />
                <button type="button" className="text-xs text-dm-accent" onClick={() => setOpenId(openId === p.id ? null : p.id)}>
                  {openId === p.id ? "收起密钥" : "管理密钥"}
                </button>
              </div>
              {openId === p.id && (
                <div className="mt-3 border-t border-dm-border pt-3">
                  {(keys.data ?? []).map((k) => (
                    <div key={k.id} className="mb-1 flex items-center gap-2 text-xs text-dm-text-2">
                      <span className="font-mono">{k.secret_hint}</span>
                      <button type="button" className="text-dm-accent" onClick={() => toggleKey.mutate(k)}>{k.enabled ? "停用" : "启用"}</button>
                    </div>
                  ))}
                  <div className="mt-2 flex gap-2">
                    <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="粘贴新密钥（不会回显明文）" className="flex-1 rounded-lg bg-dm-raised px-2 py-1 text-xs text-dm-text outline-none" />
                    <button type="button" disabled={!secret || addKey.isPending} onClick={() => addKey.mutate()} className="rounded-lg bg-dm-accent px-3 py-1 text-xs text-[#04252a]">添加</button>
                  </div>
                  {addKey.isError ? <p className="mt-1 text-[11px] text-red-400">{(addKey.error as Error).message}</p> : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
