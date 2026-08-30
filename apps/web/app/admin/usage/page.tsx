"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api, formatUsd, type AdminUsage } from "@/lib/api";

export default function AdminUsagePage() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({ queryKey: ["admin-usage", days], queryFn: () => api<AdminUsage>(`/admin/usage?days=${days}`) });

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <h1 className="font-dm-label text-lg font-semibold text-dm-text">用量与毛利</h1>
        <div className="flex-1" />
        {[7, 30, 90].map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`rounded-lg px-3 py-1.5 font-dm-label text-xs ${days === d ? "bg-dm-surface-2 text-dm-text" : "text-dm-text-3"}`}>
            {d} 天
          </button>
        ))}
      </div>
      {isLoading || !data ? (
        <p className="text-sm text-dm-text-3">加载中…</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-4 gap-3">
            {[
              { label: "任务数", value: String(data.totals.task_count) },
              { label: "用户扣费", value: formatUsd(data.totals.billed_cents) },
              { label: "退款", value: formatUsd(data.totals.refunded_cents) },
              { label: "净收入", value: formatUsd(data.totals.net_cents) },
            ].map((c) => (
              <div key={c.label} className="rounded-xl bg-dm-surface p-4">
                <p className="text-xs text-dm-text-4">{c.label}</p>
                <p className="mt-1 font-dm-label text-xl text-dm-text">{c.value}</p>
              </div>
            ))}
          </div>
          <h2 className="mb-3 text-sm text-dm-text-2">按模型</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-dm-text-4">
              <tr><th className="px-2 py-2">模型</th><th className="px-2">类型</th><th className="px-2">调用</th><th className="px-2">扣费</th></tr>
            </thead>
            <tbody>
              {data.byModel.map((m) => (
                <tr key={m.code} className="border-t border-dm-border">
                  <td className="px-2 py-2 text-dm-text">{m.name}</td>
                  <td className="px-2 text-xs text-dm-text-3">{m.creation_type}</td>
                  <td className="px-2">{m.count}</td>
                  <td className="px-2">{formatUsd(m.user_cents)}</td>
                </tr>
              ))}
              {data.byModel.length === 0 && (
                <tr><td colSpan={4} className="px-2 py-6 text-center text-dm-text-4">近 {days} 天无调用</td></tr>
              )}
            </tbody>
          </table>
          <h2 className="mb-3 mt-6 text-sm text-dm-text-2">按日</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-dm-text-4">
              <tr><th className="px-2 py-2">日期</th><th className="px-2">任务</th><th className="px-2">扣费</th></tr>
            </thead>
            <tbody>
              {data.byDay.map((d) => (
                <tr key={d.date} className="border-t border-dm-border">
                  <td className="px-2 py-2">{d.date}</td>
                  <td className="px-2">{d.count}</td>
                  <td className="px-2">{formatUsd(d.user_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
