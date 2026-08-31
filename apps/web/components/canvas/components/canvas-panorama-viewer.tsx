/**
 * 来源：vendor/infinite-canvas（tigerowo/infinite-canvas，AGPL-3.0）— D12 画布 v2 移植
 * Phase A 占位实现：全景查看器（Phase D 换 @photo-sphere-viewer 球形渲染）
 */
"use client";

import { AlertCircle } from "lucide-react";

export default function CanvasPanoramaViewer({ src, alt }: { src: string; alt?: string; proxyGeneratedPanorama?: boolean; expandOnDoubleClick?: boolean; onMoveStart?: (event: React.MouseEvent<HTMLButtonElement>) => void; onOpen?: () => void }) {
    return (
        <div className="relative h-full w-full overflow-hidden rounded-3xl bg-black/40" data-canvas-no-zoom>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt || "全景图"} draggable={false} className="h-full w-full object-contain" />
            <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-[10px] text-white backdrop-blur-sm">
                <AlertCircle className="size-3" />
                等距柱状预览（球形查看 Phase D）
            </span>
        </div>
    );
}
