"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api, type AssetRow } from "@/lib/api";
import type { MediaRef } from "@/components/shared/media-ref-tile";

export function AssetCitePopover({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (ref: MediaRef) => void;
}) {
  const [kind, setKind] = useState<"image" | "video" | "audio">("image");
  const assets = useQuery({
    queryKey: ["cite-assets", kind],
    queryFn: () => api<AssetRow[]>(`/assets?kind=${kind}&limit=48`),
    enabled: open,
  });
  if (!open) return null;
  return (
    <div className="absolute bottom-11 left-0 z-50 w-[360px] rounded-2xl border border-dm-border bg-dm-surface p-3 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-dm-text-4">引用素材</p>
        <button type="button" className="text-[10px] text-dm-text-4" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg bg-dm-raised p-0.5">
        {(["image", "video", "audio"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`h-7 rounded-md text-xs ${kind === k ? "bg-dm-surface-2 text-dm-text" : "text-dm-text-3"}`}
          >
            {k === "image" ? "图片" : k === "video" ? "视频" : "音频"}
          </button>
        ))}
      </div>
      <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto">
        {assets.isLoading ? <p className="col-span-4 py-6 text-center text-xs text-dm-text-4">加载中…</p> : null}
        {assets.data && !assets.data.length ? <p className="col-span-4 py-6 text-center text-xs text-dm-text-4">暂无资产</p> : null}
        {(assets.data ?? []).map((a) => (
          <button
            key={a.id}
            type="button"
            className="aspect-square overflow-hidden rounded-md bg-dm-raised"
            onClick={() => {
              onPick({
                url: a.url,
                assetId: a.id,
                kind: a.kind === "video" || a.kind === "audio" ? a.kind : "image",
                name: a.id.slice(0, 8),
              });
              onClose();
            }}
          >
            {a.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.url} alt="" className="h-full w-full object-cover" />
            ) : a.kind === "video" ? (
              <video src={a.url} className="h-full w-full object-cover" muted />
            ) : (
              <span className="flex h-full items-center justify-center text-[10px] text-dm-text-3">音频</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
