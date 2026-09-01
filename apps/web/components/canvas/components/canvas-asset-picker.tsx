"use client";
/**
 * 画布资产选择器（D12 Phase E）——读本项目 GET /assets（服务端资产库），
 * 选图插入画布为图片节点。形态参照 vendor asset-picker-modal 精简（AGPL-3.0）。
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, type AssetRow } from "@/lib/api";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "../theme-store";

export function CanvasAssetPickerModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (asset: AssetRow) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [kind, setKind] = useState<"image" | "video" | "audio">("image");
    const assets = useQuery({
        queryKey: ["canvas-assets", kind],
        queryFn: () => api<AssetRow[]>(`/assets?kind=${kind}&limit=48`),
        enabled: open,
    });

    return (
        <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between gap-4 pr-8">
                        选择资产
                        <div className="grid grid-cols-3 gap-1 rounded-lg p-0.5" style={{ background: theme.node.fill }}>
                            {(["image", "video", "audio"] as const).map((option) => (
                                <button key={option} type="button" className="h-7 rounded-md px-3 text-xs" style={kind === option ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }} onClick={() => setKind(option)}>
                                    {option === "image" ? "图片" : option === "video" ? "视频" : "音频"}
                                </button>
                            ))}
                        </div>
                    </DialogTitle>
                </DialogHeader>
                <div className="thin-scrollbar grid max-h-[56vh] grid-cols-4 gap-2 overflow-y-auto p-1 md:grid-cols-6">
                    {assets.isLoading ? <div className="col-span-full py-10 text-center text-sm opacity-60">加载中…</div> : null}
                    {assets.data && !assets.data.length ? <div className="col-span-full py-10 text-center text-sm opacity-60">暂无资产（先在资产页上传或生成）</div> : null}
                    {(assets.data ?? []).map((asset) => (
                        <button
                            key={asset.id}
                            type="button"
                            className="group relative aspect-square overflow-hidden rounded-lg border"
                            style={{ borderColor: theme.node.stroke }}
                            onClick={() => {
                                onPick(asset);
                                onClose();
                            }}
                        >
                            {asset.kind === "image" ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={asset.url} alt={asset.id} className="h-full w-full object-cover transition group-hover:scale-105" />
                            ) : (
                                <span className="grid h-full w-full place-items-center text-[11px]" style={{ color: theme.node.muted }}>
                                    {asset.kind === "video" ? "视频" : "音频"}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
