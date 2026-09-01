"use client";
/**
 * 节点 hover 工具条 + 节点信息弹窗（D12 Phase B 尾）
 * 来源：vendor/infinite-canvas canvas-node-hover-toolbar（AGPL-3.0）；
 * 裁剪：快捷工具配置弹层/云上传/存素材（本平台一切媒体本就落服务端 assets）/反向提示词。
 * shadcn 化：antd Tooltip/Modal/Segmented → ui/tooltip + ui/dialog + 原生分段钮。
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Crop, Download, Expand, Grid2x2, ImageIcon, Info, Lock, LockOpen, Maximize2, MessageSquare, Minus, Plus, RefreshCw, Trash2, Upload, WandSparkles } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "../theme-store";
import { CanvasNodeType, type CanvasNodeData, type ViewportTransform } from "../types";
import { isCanvasImageNodeType } from "../utils/canvas-panorama";

type ToolbarTool = {
    id: string;
    title: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
    active?: boolean;
    danger?: boolean;
};

type CanvasNodeHoverToolbarProps = {
    node: CanvasNodeData | null;
    viewport: ViewportTransform;
    onKeep: (nodeId: string) => void;
    onLeave: () => void;
    onInfo: (node: CanvasNodeData) => void;
    onDecreaseFont: (node: CanvasNodeData) => void;
    onIncreaseFont: (node: CanvasNodeData) => void;
    onUpload: (node: CanvasNodeData) => void;
    onDownload: (node: CanvasNodeData) => void;
    onGenerateImage: (node: CanvasNodeData) => void;
    onMaskEdit: (node: CanvasNodeData) => void;
    onCrop: (node: CanvasNodeData) => void;
    onSplit: (node: CanvasNodeData) => void;
    onUpscale: (node: CanvasNodeData) => void;
    onAngle: (node: CanvasNodeData) => void;
    onViewImage: (node: CanvasNodeData) => void;
    onRetry: (node: CanvasNodeData) => void;
    onToggleFreeResize: (node: CanvasNodeData) => void;
    onDelete: (node: CanvasNodeData) => void;
};

export function CanvasNodeHoverToolbar({
    node,
    viewport,
    onKeep,
    onLeave,
    onInfo,
    onDecreaseFont,
    onIncreaseFont,
    onUpload,
    onDownload,
    onGenerateImage,
    onMaskEdit,
    onCrop,
    onSplit,
    onUpscale,
    onAngle,
    onViewImage,
    onRetry,
    onToggleFreeResize,
    onDelete,
}: CanvasNodeHoverToolbarProps) {
    if (!node) return null;

    const left = viewport.x + (node.position.x + node.width / 2) * viewport.k;
    const top = viewport.y + node.position.y * viewport.k - 14;
    const isImage = isCanvasImageNodeType(node.type);
    const isVideo = node.type === CanvasNodeType.Video;
    const isAudio = node.type === CanvasNodeType.Audio;
    const hasImage = isImage && Boolean(node.metadata?.content);
    const hasMedia = Boolean(hasImage || (isVideo && node.metadata?.content) || (isAudio && node.metadata?.content));
    const isText = node.type === CanvasNodeType.Text;
    const canRetry = node.metadata?.status === "error";

    const baseTools: ToolbarTool[] = [
        { id: "info", title: "查看节点信息", label: "信息", icon: <Info className="size-4" />, onClick: () => onInfo(node) },
        { id: "delete", title: "移除节点", label: "删除", icon: <Trash2 className="size-4" />, onClick: () => onDelete(node), danger: true },
    ];
    const nodeTools: ToolbarTool[] = [
        ...(canRetry ? [{ id: "retry", title: "重新生成", label: "重试", icon: <RefreshCw className="size-4" />, onClick: () => onRetry(node) }] : []),
        ...(hasMedia ? [{ id: "download", title: isAudio ? "下载音频" : isVideo ? "下载视频" : "下载图片", label: "下载", icon: <Download className="size-4" />, onClick: () => onDownload(node) }] : []),
        ...(isText ? [{ id: "generateImage", title: "用文本生图", label: "生图", icon: <ImageIcon className="size-4" />, onClick: () => onGenerateImage(node) }] : []),
        ...(isText ? [{ id: "decreaseFont", title: "减小字号", label: "缩小", icon: <Minus className="size-4" />, onClick: () => onDecreaseFont(node) }] : []),
        ...(isText ? [{ id: "increaseFont", title: "增大字号", label: "放大", icon: <Plus className="size-4" />, onClick: () => onIncreaseFont(node) }] : []),
        ...((isImage && !hasImage) || (isVideo && !node.metadata?.content) || (isAudio && !node.metadata?.content)
            ? [{ id: "upload", title: "上传媒体", label: "上传", icon: <Upload className="size-4" />, onClick: () => onUpload(node) }]
            : []),
        ...(hasImage ? imageTools(node, { onMaskEdit, onCrop, onSplit, onUpscale, onAngle, onViewImage, onToggleFreeResize }) : []),
    ];
    const tools = [...baseTools, ...nodeTools];

    return (
        <TooltipProvider delayDuration={200}>
            <div
                className="absolute z-[70] flex max-w-[min(800px,calc(100vw-32px))] -translate-x-1/2 -translate-y-full flex-wrap items-center justify-center gap-x-2 overflow-visible rounded-xl border border-white/10 bg-[#242424] px-2 text-[13px] text-[#f3f3f3] shadow-[0_8px_28px_rgba(0,0,0,.28)]"
                style={{ left, top }}
                onMouseEnter={() => onKeep(node.id)}
                onMouseLeave={onLeave}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                {tools.map((tool) => (
                    <ToolbarAction key={tool.id} {...tool} />
                ))}
            </div>
        </TooltipProvider>
    );
}

function imageTools(
    node: CanvasNodeData,
    handlers: {
        onMaskEdit: (node: CanvasNodeData) => void;
        onCrop: (node: CanvasNodeData) => void;
        onSplit: (node: CanvasNodeData) => void;
        onUpscale: (node: CanvasNodeData) => void;
        onAngle: (node: CanvasNodeData) => void;
        onViewImage: (node: CanvasNodeData) => void;
        onToggleFreeResize: (node: CanvasNodeData) => void;
    },
): ToolbarTool[] {
    return [
        { id: "view", title: "放大预览", label: "预览", icon: <Maximize2 className="size-4" />, onClick: () => handlers.onViewImage(node) },
        { id: "crop", title: "裁剪图片", label: "裁剪", icon: <Crop className="size-4" />, onClick: () => handlers.onCrop(node) },
        { id: "split", title: "切分图片", label: "切分", icon: <Grid2x2 className="size-4" />, onClick: () => handlers.onSplit(node) },
        { id: "upscale", title: "图片放大", label: "放大", icon: <Expand className="size-4" />, onClick: () => handlers.onUpscale(node) },
        { id: "angle", title: "AI 多角度", label: "多角度", icon: <WandSparkles className="size-4" />, onClick: () => handlers.onAngle(node) },
        { id: "mask", title: "局部重绘（蒙版编辑）", label: "重绘", icon: <MessageSquare className="size-4" />, onClick: () => handlers.onMaskEdit(node) },
        { id: "freeResize", title: node.metadata?.freeResize ? "切换为等比缩放" : "切换为自由比例", label: node.metadata?.freeResize ? "等比" : "自由", icon: node.metadata?.freeResize ? <Lock className="size-4" /> : <LockOpen className="size-4" />, active: Boolean(node.metadata?.freeResize), onClick: () => handlers.onToggleFreeResize(node) },
    ];
}

function ToolbarAction({ title, label, icon, onClick, active = false, danger = false }: ToolbarTool) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button type="button" className={`group relative flex h-12 items-center whitespace-nowrap ${danger ? "text-[#ef4444]" : ""}`} onClick={onClick} aria-label={title}>
                    <span className={`flex h-8 items-center gap-2 rounded-lg px-2.5 transition group-hover:bg-white/10 ${active ? "bg-white/10" : ""}`}>
                        {icon}
                        <span>{label}</span>
                    </span>
                </button>
            </TooltipTrigger>
            <TooltipContent side="top">{title}</TooltipContent>
        </Tooltip>
    );
}

export function CanvasNodeInfoModal({ node, open, onClose }: { node: CanvasNodeData | null; open: boolean; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [view, setView] = useState<"info" | "json">("info");
    const batchCount = isCanvasImageNodeType(node?.type) ? node?.metadata?.batchChildIds?.length || 0 : 0;
    const json = useMemo(() => {
        if (!node) return "";
        return JSON.stringify(node, (key, value) => (key === "panoramaFinalPrompt" ? undefined : value), 2);
    }, [node]);

    useEffect(() => {
        if (open) setView("info");
    }, [node?.id, open]);

    return (
        <Dialog open={open && Boolean(node)} onOpenChange={(next) => (next ? undefined : onClose())}>
            <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between gap-4 pr-8">
                        节点信息
                        <div className="grid grid-cols-2 gap-1 rounded-lg p-0.5" style={{ background: theme.node.fill }}>
                            <button type="button" className="h-7 rounded-md px-3 text-xs" style={view === "info" ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }} onClick={() => setView("info")}>信息</button>
                            <button type="button" className="h-7 rounded-md px-3 text-xs" style={view === "json" ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }} onClick={() => setView("json")}>JSON</button>
                        </div>
                    </DialogTitle>
                </DialogHeader>
                {node ? (
                    <div className="h-[56vh] min-h-[360px] text-sm">
                        {view === "info" ? (
                            <div className="thin-scrollbar h-full space-y-3 overflow-auto pr-1">
                                <InfoRow label="ID" value={node.id} />
                                <InfoRow label="名称" value={node.title || "未命名节点"} />
                                <InfoRow label="类型" value={typeLabel(node.type)} />
                                <InfoRow label="尺寸" value={`${Math.round(node.width)} x ${Math.round(node.height)}`} />
                                <InfoRow label="位置" value={`${Math.round(node.position.x)}, ${Math.round(node.position.y)}`} />
                                <InfoRow label="状态" value={node.metadata?.status || "idle"} />
                                {batchCount > 1 ? <InfoRow label="图片组" value={`${batchCount} 张`} /> : null}
                                {node.metadata?.prompt ? <InfoRow label="提示词" value={node.metadata.prompt} /> : null}
                                {node.metadata?.errorDetails ? (
                                    <div className="rounded-lg border p-3 text-red-400" style={{ borderColor: theme.node.stroke }}>
                                        {node.metadata.errorDetails}
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <pre className="thin-scrollbar h-full overflow-auto rounded-lg border p-3 text-xs leading-5" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}>
                                {json}
                            </pre>
                        )}
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

function typeLabel(type: CanvasNodeType) {
    const labels: Record<CanvasNodeType, string> = {
        [CanvasNodeType.Text]: "文本",
        [CanvasNodeType.Image]: "图片",
        [CanvasNodeType.Panorama]: "全景图",
        [CanvasNodeType.Video]: "视频",
        [CanvasNodeType.Audio]: "音频",
        [CanvasNodeType.Director]: "导演台",
        [CanvasNodeType.Group]: "组",
        [CanvasNodeType.Config]: "生成配置",
    };
    return labels[type];
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
            <span className="opacity-50">{label}</span>
            <span className="min-w-0 whitespace-pre-wrap break-words">{value}</span>
        </div>
    );
}
