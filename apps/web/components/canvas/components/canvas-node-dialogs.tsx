"use client";
/**
 * 节点编辑弹窗（裁剪/切分/放大/多角度，D12 Phase B 尾）
 * 来源：vendor/infinite-canvas 对应四弹窗（AGPL-3.0）；antd Modal/Button/Segmented/Dropdown/Slider/InputNumber
 * → shadcn Dialog + 原生 button/input range（CANVAS-RESEARCH 附录A）。
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, ChevronDown, Grid2x2, ImagePlus, ListRestart, Lock, LockOpen, PanelTop, RotateCcw, Rows3, Trash2, WandSparkles, X } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { readImageMeta } from "@/lib/canvas-image-utils";
import { MAX_UPSCALE_LONG_EDGE, resolveUpscaleSize, type ImageAngleTransform, type ImageSplitParams, type ImageUpscaleAlgorithm, type ImageUpscaleParams } from "../utils/canvas-image-ops";

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
    return (
        <button type="button" className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#2f80ff] px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40" disabled={disabled} onClick={onClick}>
            {children}
        </button>
    );
}

function GhostButton({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
    return (
        <button type="button" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-dm-border px-4 text-sm transition hover:bg-dm-surface disabled:opacity-40" disabled={disabled} onClick={onClick}>
            {children}
        </button>
    );
}

// ---------------- 裁剪 ----------------

export type CanvasImageCropRect = { x: number; y: number; width: number; height: number };
type DragMode = "move" | "resize";
type ResizeHandle = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";
const cropHandles: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const minCropSize = 0.06;
const defaultCrop = { x: 0.12, y: 0.12, width: 0.76, height: 0.76 };

export function CanvasNodeCropDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (crop: CanvasImageCropRect) => Promise<void> | void }) {
    const boxRef = useRef<HTMLDivElement>(null);
    const [crop, setCrop] = useState<CanvasImageCropRect>(defaultCrop);
    const [aspectRatio, setAspectRatio] = useState<number | null>(null);
    const [ratioLabel, setRatioLabel] = useState("自由比例");
    const [ratioMenuOpen, setRatioMenuOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const cropSize = image ? { width: Math.max(1, Math.round(crop.width * image.width)), height: Math.max(1, Math.round(crop.height * image.height)) } : null;

    useEffect(() => {
        if (open) {
            setCrop(defaultCrop);
            setAspectRatio(null);
            setRatioLabel("自由比例");
        }
    }, [dataUrl, open]);

    useEffect(() => {
        if (!open) return;
        void readImageMeta(dataUrl).then(setImage);
    }, [dataUrl, open]);

    const startDrag = (mode: DragMode, event: ReactPointerEvent, handle?: ResizeHandle) => {
        if (loading) return;
        const box = boxRef.current?.getBoundingClientRect();
        if (!box) return;
        event.preventDefault();
        event.stopPropagation();
        const start = { x: event.clientX, y: event.clientY, crop };
        const move = (event: PointerEvent) => {
            const dx = (event.clientX - start.x) / box.width;
            const dy = (event.clientY - start.y) / box.height;
            setCrop(mode === "move" ? moveCrop(start.crop, dx, dy) : resizeCrop(start.crop, dx, dy, handle || "se", aspectRatio, box));
        };
        const up = () => {
            document.removeEventListener("pointermove", move);
            document.removeEventListener("pointerup", up);
        };
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", up);
    };

    const applyRatio = (ratio: number | null, label: string) => {
        setRatioMenuOpen(false);
        setRatioLabel(label);
        if (ratio === null) {
            setAspectRatio(null);
            return;
        }
        setAspectRatio(ratio);
        const box = boxRef.current?.getBoundingClientRect();
        if (!box || !image) return;

        let w = 0.76;
        let h = (w * box.width) / (ratio * box.height);
        if (h > 0.76) {
            h = 0.76;
            w = (h * ratio * box.height) / box.width;
        }

        setCrop({ x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h });
    };

    const ratioOptions = useMemo(
        () => [
            { key: "free", label: "自由比例" },
            { key: "original", label: "原始比例" },
            { key: "1:1", label: "1:1 比例" },
            { key: "4:3", label: "4:3 比例" },
            { key: "16:9", label: "16:9 比例" },
            { key: "3:4", label: "3:4 比例" },
            { key: "9:16", label: "9:16 比例" },
        ],
        [],
    );

    return (
        <Dialog open={open && Boolean(dataUrl)} onOpenChange={(next) => (next || !loading ? onClose() : undefined)}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[780px]">
                <DialogHeader>
                    <DialogTitle>裁剪图片</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="flex justify-center">
                        <div ref={boxRef} className="relative inline-block max-w-full select-none overflow-hidden rounded-lg bg-black">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={dataUrl} alt="" className="block max-h-[62vh] max-w-full opacity-90" draggable={false} />
                            <CropMask crop={crop} />
                            <div className="absolute cursor-move border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.3),0_0_28px_rgba(0,0,0,.28)]" style={cropStyle(crop)} onPointerDown={(event) => startDrag("move", event)}>
                                <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/50" />
                                <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/50" />
                                <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/50" />
                                <div className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/50" />
                                {cropHandles.map((handle) => (
                                    <button key={handle} type="button" className="absolute size-3 rounded-full border border-black bg-white" style={handleStyle(handle)} onPointerDown={(event) => startDrag("resize", event, handle)} aria-label="调整裁剪框" />
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="relative flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2">
                        <div className="flex flex-wrap items-center gap-3 text-sm opacity-80">
                            <span>裁剪尺寸 {cropSize ? `${cropSize.width} x ${cropSize.height}` : "未知"}</span>
                            <span>比例 {cropSize ? formatRatio(cropSize.width, cropSize.height) : "未知"}</span>
                            {image ? <span>原图 {image.width} x {image.height}</span> : null}
                        </div>
                        <div className="relative">
                            <GhostButton onClick={() => setRatioMenuOpen((openValue) => !openValue)}>
                                {aspectRatio === null ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
                                {ratioLabel} <ChevronDown className="ml-1 size-3.5" />
                            </GhostButton>
                            {ratioMenuOpen ? (
                                <div className="absolute bottom-12 right-0 z-50 min-w-36 overflow-hidden rounded-lg border border-dm-border bg-dm-surface py-1 shadow-xl">
                                    {ratioOptions.map((option) => (
                                        <button
                                            key={option.key}
                                            type="button"
                                            className="block w-full px-3 py-2 text-left text-xs hover:opacity-75"
                                            onClick={() => {
                                                if (option.key === "free") applyRatio(null, option.label);
                                                else if (option.key === "original") {
                                                    if (image) applyRatio(image.width / image.height, option.label);
                                                } else {
                                                    const [w, h] = option.key.split(":").map(Number);
                                                    applyRatio(w / h, option.label);
                                                }
                                            }}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                        <GhostButton disabled={loading} onClick={() => setCrop(defaultCrop)}>重置</GhostButton>
                        <GhostButton disabled={loading} onClick={onClose}>
                            <X className="size-4" /> 取消
                        </GhostButton>
                        <PrimaryButton
                            disabled={loading}
                            onClick={async () => {
                                setLoading(true);
                                try {
                                    await onConfirm(crop);
                                } finally {
                                    setLoading(false);
                                }
                            }}
                        >
                            {loading ? "正在裁剪..." : (<><Check className="size-4" /> 确认裁剪</>)}
                        </PrimaryButton>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function CropMask({ crop }: { crop: CanvasImageCropRect }) {
    return (
        <>
            <div className="absolute inset-x-0 top-0 bg-black/55" style={{ height: `${crop.y * 100}%` }} />
            <div className="absolute inset-x-0 bottom-0 bg-black/55" style={{ height: `${(1 - crop.y - crop.height) * 100}%` }} />
            <div className="absolute bg-black/55" style={{ left: 0, top: `${crop.y * 100}%`, width: `${crop.x * 100}%`, height: `${crop.height * 100}%` }} />
            <div className="absolute bg-black/55" style={{ right: 0, top: `${crop.y * 100}%`, width: `${(1 - crop.x - crop.width) * 100}%`, height: `${crop.height * 100}%` }} />
        </>
    );
}

function moveCrop(crop: CanvasImageCropRect, dx: number, dy: number): CanvasImageCropRect {
    return { ...crop, x: clampNum(crop.x + dx, 0, 1 - crop.width), y: clampNum(crop.y + dy, 0, 1 - crop.height) };
}

function resizeCrop(crop: CanvasImageCropRect, dx: number, dy: number, handle: ResizeHandle, aspectRatio: number | null, box: DOMRect): CanvasImageCropRect {
    let next = { ...crop };
    if (handle.includes("e")) next.width = crop.width + dx;
    if (handle.includes("s")) next.height = crop.height + dy;
    if (handle.includes("w")) {
        next.x = crop.x + dx;
        next.width = crop.width - dx;
    }
    if (handle.includes("n")) {
        next.y = crop.y + dy;
        next.height = crop.height - dy;
    }

    if (aspectRatio !== null) {
        if (handle === "n" || handle === "s") {
            next.width = (next.height * box.height * aspectRatio) / box.width;
            next.x = crop.x + (crop.width - next.width) / 2;
        } else if (handle === "e" || handle === "w") {
            next.height = (next.width * box.width) / (aspectRatio * box.height);
            next.y = crop.y + (crop.height - next.height) / 2;
        } else {
            next.height = (next.width * box.width) / (aspectRatio * box.height);
            if (handle.includes("n")) {
                next.y = crop.y + crop.height - next.height;
            }
        }
    }

    next.width = clampNum(next.width, minCropSize, 1);
    next.height = clampNum(next.height, minCropSize, 1);

    if (aspectRatio !== null) {
        if (Math.abs((next.width * box.width) / (next.height * box.height) - aspectRatio) > 0.01) {
            next.height = (next.width * box.width) / (aspectRatio * box.height);
        }
    }

    next.x = clampNum(next.x, 0, 1 - next.width);
    next.y = clampNum(next.y, 0, 1 - next.height);
    return next;
}

function cropStyle(crop: CanvasImageCropRect) {
    return { left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` };
}

function handleStyle(handle: ResizeHandle) {
    const top = handle.includes("n") ? "-6px" : handle.includes("s") ? "calc(100% - 6px)" : "calc(50% - 6px)";
    const left = handle.includes("w") ? "-6px" : handle.includes("e") ? "calc(100% - 6px)" : "calc(50% - 6px)";
    return { top, left, cursor: `${handle}-resize` };
}

function clampNum(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function formatRatio(width: number, height: number) {
    const divisor = gcd(width, height);
    return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function gcd(a: number, b: number): number {
    return b ? gcd(b, a % b) : Math.max(1, a);
}

// ---------------- 切分 ----------------

const defaultSplitParams: ImageSplitParams = { horizontalLines: [0.5], verticalLines: [0.5] };
const maxGridSize = 12;
type SplitAxis = "horizontal" | "vertical";
type ActiveLine = { axis: SplitAxis; index: number } | null;

export function CanvasNodeSplitDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: ImageSplitParams) => void }) {
    const [params, setParams] = useState(defaultSplitParams);
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const [active, setActive] = useState<ActiveLine>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ pointerId: number; box: DOMRect } | null>(null);
    const rows = params.horizontalLines.length + 1;
    const columns = params.verticalLines.length + 1;
    const total = rows * columns;
    const pieceSize = image ? { width: Math.max(1, Math.floor(image.width / columns)), height: Math.max(1, Math.floor(image.height / rows)) } : null;

    useEffect(() => {
        if (!open) return;
        setParams(defaultSplitParams);
        setActive(null);
        setImage(null);
        void readImageMeta(dataUrl).then(setImage);
    }, [dataUrl, open]);

    const addLine = (axis: SplitAxis) => {
        const key = axis === "horizontal" ? "horizontalLines" : "verticalLines";
        setActive(null);
        setParams((current) => {
            const lines = current[key];
            if (lines.length >= maxGridSize - 1) return current;
            return { ...current, [key]: [...lines, findLineSpot(lines)].sort((a, b) => a - b) };
        });
    };

    const deleteLine = () => {
        if (!active) return;
        const key = active.axis === "horizontal" ? "horizontalLines" : "verticalLines";
        setParams((current) => ({ ...current, [key]: current[key].filter((_, index) => index !== active.index) }));
        setActive(null);
    };

    const setLine = (axis: SplitAxis, index: number, value: number) => {
        const key = axis === "horizontal" ? "horizontalLines" : "verticalLines";
        setParams((current) => {
            const lines = [...current[key]];
            lines[index] = clampLine(value, lines[index - 1] ?? 0, lines[index + 1] ?? 1);
            return { ...current, [key]: lines };
        });
    };

    const startDrag = (axis: SplitAxis, index: number, event: ReactPointerEvent<HTMLDivElement>) => {
        if (dragRef.current) return;
        const box = previewRef.current?.getBoundingClientRect();
        if (!box || box.width <= 0 || box.height <= 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { pointerId: event.pointerId, box };
        setActive({ axis, index });
    };

    const moveLine = (axis: SplitAxis, index: number, event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const value = axis === "horizontal" ? (event.clientY - drag.box.top) / drag.box.height : (event.clientX - drag.box.left) / drag.box.width;
        setLine(axis, index, value);
    };

    const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };

    return (
        <Dialog open={open && Boolean(dataUrl)} onOpenChange={(next) => (next ? undefined : onClose())}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[780px]">
                <DialogHeader>
                    <DialogTitle>切分图片</DialogTitle>
                </DialogHeader>
                <p className="-mt-2 text-sm opacity-60">生成 {total} 个图片子节点，并按原图网格排列到画布右侧</p>
                <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_280px]">
                    <div className="rounded-xl border p-4">
                        <div className="grid min-h-[300px] place-items-center rounded-lg bg-black/5">
                            <div ref={previewRef} className="relative inline-block max-w-full overflow-hidden rounded-lg bg-black shadow-xl">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={dataUrl} alt="" className="block max-h-[340px] max-w-full object-contain opacity-95" draggable={false} />
                                <SplitGrid horizontalLines={params.horizontalLines} verticalLines={params.verticalLines} active={active} onPointerDown={startDrag} onPointerMove={moveLine} onPointerEnd={endDrag} />
                            </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                            <span className="opacity-60">原图</span>
                            <span className="font-semibold">{image ? `${image.width} x ${image.height} px` : "读取中"}</span>
                        </div>
                    </div>
                    <div className="space-y-4 py-2">
                        <label className="block space-y-2">
                            <span className="text-sm font-medium opacity-75">行数（1-{maxGridSize}）</span>
                            <input
                                type="number"
                                min={1}
                                max={maxGridSize}
                                value={rows}
                                className="h-10 w-full rounded-lg border border-dm-border bg-dm-surface px-3 text-sm outline-none"
                                onChange={(event) => {
                                    const count = clampGrid(event.target.value);
                                    setActive(null);
                                    setParams((current) => ({ ...current, horizontalLines: buildGridLines(count) }));
                                }}
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm font-medium opacity-75">列数（1-{maxGridSize}）</span>
                            <input
                                type="number"
                                min={1}
                                max={maxGridSize}
                                value={columns}
                                className="h-10 w-full rounded-lg border border-dm-border bg-dm-surface px-3 text-sm outline-none"
                                onChange={(event) => {
                                    const count = clampGrid(event.target.value);
                                    setActive(null);
                                    setParams((current) => ({ ...current, verticalLines: buildGridLines(count) }));
                                }}
                            />
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <GhostButton disabled={rows >= maxGridSize} onClick={() => addLine("horizontal")}><Rows3 className="size-4" /> 横向线</GhostButton>
                            <GhostButton disabled={columns >= maxGridSize} onClick={() => addLine("vertical")}><PanelTop className="size-4 rotate-90" /> 纵向线</GhostButton>
                            <GhostButton disabled={!active} onClick={deleteLine}><Trash2 className="size-4" /> 删除线</GhostButton>
                            <GhostButton onClick={() => { setActive(null); setParams((current) => ({ horizontalLines: buildGridLines(current.horizontalLines.length + 1), verticalLines: buildGridLines(current.verticalLines.length + 1) })); }}>
                                <ListRestart className="size-4" /> 重置线
                            </GhostButton>
                        </div>
                        <div className="rounded-xl border px-4 py-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="opacity-60">切片数量</span>
                                <span className="font-semibold">{total} 个</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                                <span className="opacity-60">平均约</span>
                                <span className="font-semibold">{pieceSize ? `${pieceSize.width} x ${pieceSize.height}` : "未知"}</span>
                            </div>
                        </div>
                        <PrimaryButton disabled={!image} onClick={() => onConfirm(params)}>
                            <Grid2x2 className="size-4" /> 生成子节点
                        </PrimaryButton>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function SplitGrid({ horizontalLines, verticalLines, active, onPointerDown, onPointerMove, onPointerEnd }: { horizontalLines: number[]; verticalLines: number[]; active: ActiveLine; onPointerDown: (axis: SplitAxis, index: number, event: ReactPointerEvent<HTMLDivElement>) => void; onPointerMove: (axis: SplitAxis, index: number, event: ReactPointerEvent<HTMLDivElement>) => void; onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void }) {
    return (
        <div className="pointer-events-none absolute inset-0">
            {verticalLines.map((line, index) => (
                <div key={`column-${index}`} className="pointer-events-auto absolute inset-y-0 -ml-2 w-4 cursor-ew-resize touch-none select-none" style={{ left: `${line * 100}%` }} onPointerDown={(event) => onPointerDown("vertical", index, event)} onPointerMove={(event) => onPointerMove("vertical", index, event)} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd}>
                    <div className={`absolute left-1/2 top-0 h-full border-l shadow-[0_0_0_1px_rgba(0,0,0,.35)] ${active?.axis === "vertical" && active.index === index ? "border-amber-300" : "border-white/90"}`} />
                </div>
            ))}
            {horizontalLines.map((line, index) => (
                <div key={`row-${index}`} className="pointer-events-auto absolute inset-x-0 -mt-2 h-4 cursor-ns-resize touch-none select-none" style={{ top: `${line * 100}%` }} onPointerDown={(event) => onPointerDown("horizontal", index, event)} onPointerMove={(event) => onPointerMove("horizontal", index, event)} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd}>
                    <div className={`absolute left-0 top-1/2 w-full border-t shadow-[0_0_0_1px_rgba(0,0,0,.35)] ${active?.axis === "horizontal" && active.index === index ? "border-amber-300" : "border-white/90"}`} />
                </div>
            ))}
        </div>
    );
}

function buildGridLines(count: number) {
    return Array.from({ length: Math.max(1, count) - 1 }, (_, index) => (index + 1) / count);
}

function findLineSpot(lines: number[]) {
    const cuts = [0, ...lines, 1].sort((a, b) => a - b);
    let spot = 0.5;
    let max = 0;
    for (let index = 0; index < cuts.length - 1; index += 1) {
        const gap = cuts[index + 1] - cuts[index];
        if (gap > max) {
            max = gap;
            spot = cuts[index] + gap / 2;
        }
    }
    return spot;
}

function clampLine(value: number, min: number, max: number) {
    return Math.min(max - 0.01, Math.max(min + 0.01, value));
}

function clampGrid(value: string) {
    const numberValue = Number(value);
    return Math.min(maxGridSize, Math.max(1, Math.round(Number.isFinite(numberValue) ? numberValue : 1)));
}

// ---------------- 放大 ----------------

const upscaleAlgorithms: Array<{ value: ImageUpscaleAlgorithm; title: string; description: string }> = [
    { value: "high", title: "高清插值", description: "适合照片和细节图" },
    { value: "bilinear", title: "双线性", description: "平滑、速度快" },
    { value: "nearest", title: "最近邻", description: "适合像素风格" },
];

const targetOptions = [
    { label: "1K", value: 1024 },
    { label: "2K", value: 2048 },
    { label: "4K", value: MAX_UPSCALE_LONG_EDGE },
];

const defaultUpscaleParams: ImageUpscaleParams = { targetLongEdge: 2048, algorithm: "high" };

export function CanvasNodeUpscaleDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: ImageUpscaleParams) => void }) {
    const [params, setParams] = useState<ImageUpscaleParams>(defaultUpscaleParams);
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const sourceLongEdge = image ? Math.max(image.width, image.height) : 0;
    const outputSize = useMemo(() => (image ? resolveUpscaleSize(image.width, image.height, params.targetLongEdge) : null), [image, params.targetLongEdge]);
    const canUpscale = Boolean(image && sourceLongEdge < params.targetLongEdge && params.targetLongEdge <= MAX_UPSCALE_LONG_EDGE);
    const reachedMax = Boolean(image && sourceLongEdge >= MAX_UPSCALE_LONG_EDGE);

    useEffect(() => {
        if (!open) return;
        setParams(defaultUpscaleParams);
        setImage(null);
    }, [dataUrl, open]);

    useEffect(() => {
        if (!open) return;
        void readImageMeta(dataUrl).then(setImage);
    }, [dataUrl, open]);

    useEffect(() => {
        if (!image) return;
        const nextTarget = targetOptions.find((option) => sourceLongEdge < option.value)?.value || MAX_UPSCALE_LONG_EDGE;
        setParams((current) => ({ ...current, targetLongEdge: nextTarget }));
    }, [image, sourceLongEdge]);

    return (
        <Dialog open={open && Boolean(dataUrl)} onOpenChange={(next) => (next ? undefined : onClose())}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[820px]">
                <DialogHeader>
                    <DialogTitle>图片放大</DialogTitle>
                </DialogHeader>
                <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_360px]">
                    <div className="rounded-xl border p-4">
                        <div className="grid min-h-[280px] place-items-center rounded-lg bg-black/5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={dataUrl} alt="" className="max-h-[320px] max-w-full rounded-lg object-contain shadow-xl" draggable={false} />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                            <span className="opacity-60">源图</span>
                            <span className="font-semibold">{image ? `${image.width} x ${image.height} px` : "读取中"}</span>
                        </div>
                    </div>
                    <div className="space-y-6 py-2">
                        <div className="space-y-2">
                            <div className="text-sm font-medium opacity-75">目标像素</div>
                            <div className="grid grid-cols-3 gap-1 rounded-lg p-1" style={{ background: "var(--dm-surface-2, #292524)" }}>
                                {targetOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        disabled={Boolean(image && sourceLongEdge >= option.value)}
                                        className="h-9 rounded-md text-xs transition disabled:opacity-35"
                                        style={params.targetLongEdge === option.value ? { background: "#2f80ff", color: "#fff" } : undefined}
                                        onClick={() => setParams((current) => ({ ...current, targetLongEdge: option.value }))}
                                    >
                                        {option.label} · {option.value}px
                                    </button>
                                ))}
                            </div>
                            {image && !canUpscale ? <div className="text-xs font-medium text-[#ef4444]">{reachedMax ? "图片已达到 4K，无需放大" : "图片已达到当前目标像素，无需放大"}</div> : null}
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium opacity-75">放大算法</div>
                            <div className="grid grid-cols-3 gap-1">
                                {upscaleAlgorithms.map((item) => (
                                    <button
                                        key={item.value}
                                        type="button"
                                        className="flex min-h-12 flex-col justify-center rounded-lg border p-2 text-left leading-5 transition"
                                        style={params.algorithm === item.value ? { borderColor: "#2f80ff", background: "rgba(47,128,255,.08)" } : undefined}
                                        onClick={() => setParams((current) => ({ ...current, algorithm: item.value }))}
                                    >
                                        <span className="text-xs font-medium">{item.title}</span>
                                        <span className="text-[10px] opacity-55">{item.description}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-xl border px-4 py-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="opacity-60">输出尺寸</span>
                                <span className="font-semibold">{outputSize ? `${outputSize.width} x ${outputSize.height} px` : "未知"}</span>
                            </div>
                        </div>
                        <PrimaryButton disabled={!canUpscale} onClick={() => onConfirm(params)}>
                            <ImagePlus className="size-4" /> 生成放大图
                        </PrimaryButton>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ---------------- 多角度 ----------------

export type CanvasImageAngleParams = ImageAngleTransform;

const defaultAngleParams: CanvasImageAngleParams = { horizontalAngle: 0, pitchAngle: 9, cameraDistance: 4.8, wideAngle: false };

export function CanvasNodeAngleDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: CanvasImageAngleParams) => void }) {
    const [params, setParams] = useState(defaultAngleParams);

    useEffect(() => {
        if (open) setParams(defaultAngleParams);
    }, [dataUrl, open]);

    return (
        <Dialog open={open && Boolean(dataUrl)} onOpenChange={(next) => (next ? undefined : onClose())}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[860px]">
                <DialogHeader>
                    <DialogTitle>AI 多角度</DialogTitle>
                </DialogHeader>
                <p className="-mt-2 text-sm opacity-60">左侧只预览方向，确认后按该视角生成本地变换结果作为新节点</p>
                <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_360px]">
                    <div className="flex min-h-[300px] flex-col justify-between rounded-xl border p-4">
                        <div className="grid flex-1 place-items-center">
                            <div className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={dataUrl} alt="" className="size-48 rounded-2xl object-cover shadow-2xl" draggable={false} style={{ transform: previewTransform(params) }} />
                                <div className="absolute -bottom-6 left-1/2 h-10 w-24 -translate-x-1/2 rounded-full border bg-black/20 backdrop-blur" />
                            </div>
                        </div>
                        <GhostButton onClick={() => setParams(defaultAngleParams)}><RotateCcw className="size-4" /> 重置</GhostButton>
                    </div>
                    <div className="space-y-6 py-2">
                        <AngleSlider label="左右角度" value={params.horizontalAngle} min={-60} max={60} step={1} suffix="deg" onChange={(value) => setParams((current) => ({ ...current, horizontalAngle: value }))} />
                        <AngleSlider label="俯仰角度" value={params.pitchAngle} min={-45} max={45} step={1} suffix="deg" onChange={(value) => setParams((current) => ({ ...current, pitchAngle: value }))} />
                        <AngleSlider label="镜头距离" value={params.cameraDistance} min={1} max={10} step={0.1} suffix="" onChange={(value) => setParams((current) => ({ ...current, cameraDistance: value }))} />
                        <div className="grid grid-cols-[88px_1fr] items-center gap-4">
                            <span className="text-sm font-medium opacity-75">广角镜头</span>
                            <div className="grid w-fit grid-cols-2 gap-1 rounded-lg p-1" style={{ background: "var(--dm-surface-2, #292524)" }}>
                                <button type="button" className="h-8 rounded-md px-3 text-xs transition" style={!params.wideAngle ? { background: "#2f80ff", color: "#fff" } : undefined} onClick={() => setParams((current) => ({ ...current, wideAngle: false }))}>标准</button>
                                <button type="button" className="h-8 rounded-md px-3 text-xs transition" style={params.wideAngle ? { background: "#2f80ff", color: "#fff" } : undefined} onClick={() => setParams((current) => ({ ...current, wideAngle: true }))}>广角</button>
                            </div>
                        </div>
                        <PrimaryButton onClick={() => onConfirm(params)}>
                            <WandSparkles className="size-4" /> 生成
                        </PrimaryButton>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function AngleSlider({ label, value, min, max, step, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
    return (
        <div className="grid grid-cols-[88px_1fr_72px] items-center gap-4">
            <span className="text-sm font-medium opacity-75">{label}</span>
            <input type="range" min={min} max={max} step={step} value={value} className="w-full" style={{ accentColor: "#2f80ff" }} onChange={(event) => onChange(Number(event.target.value))} />
            <span className="whitespace-nowrap text-right text-sm font-semibold">
                {Number.isInteger(value) ? value : value.toFixed(1)}
                {suffix}
            </span>
        </div>
    );
}

function previewTransform(params: CanvasImageAngleParams) {
    const scale = 1.08 - params.cameraDistance * 0.035 + (params.wideAngle ? -0.08 : 0);
    return `perspective(520px) rotateY(${params.horizontalAngle * -0.45}deg) rotateX(${params.pitchAngle * 0.35}deg) scale(${Math.max(0.72, Math.min(1.08, scale))})`;
}
