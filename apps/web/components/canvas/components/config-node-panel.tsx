"use client";
/**
 * 生成配置节点面板（D12 Phase B）
 * 布局参照 vendor/infinite-canvas canvas-config-node-panel（AGPL-3.0）；
 * 数据/计价全接本项目：模型=admin models 表（/config/creation-types），价格=shared pricing（显示=实扣，美元）。
 * shadcn 化：antd Segmented/Button/Popover → 原生分段钮 + Select。
 */
import { Image as ImageIcon, LoaderCircle, Play, Video } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatUsd, type ModelEntry } from "@/lib/api";
import { canvasThemes } from "@/lib/canvas-theme";
import { estimateCostCents } from "@/lib/canvas/generation";
import { useThemeStore } from "../theme-store";
import { CanvasCameraControl } from "./canvas-camera-control";
import type { CameraControlOptions, CanvasNodeData, CanvasNodeMetadata } from "../types";

export interface ConfigNodeDraft {
  model?: string;
  ratio?: string;
  resolution?: string;
  count?: number;
  durationSeconds?: number;
}

type ConfigNodePanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    imageModels: ModelEntry[];
    videoModels: ModelEntry[];
    inputSummary: { textCount: number; imageCount: number; videoCount: number; audioCount: number };
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (nodeId: string) => void;
};

export function ConfigNodePanel({ node, isRunning, imageModels, videoModels, inputSummary, onConfigChange, onGenerate }: ConfigNodePanelProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = node.metadata?.generationMode === "video" ? "video" : "image";
    const models = mode === "image" ? imageModels : videoModels;
    const model = models.find((item) => item.code === node.metadata?.model) ?? models.find((item) => item.is_default) ?? models[0];
    const chipStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text };
    const controlStyle = { background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text };

    const ratioOptions = model?.params.aspect_ratio?.options ?? [];
    const resolutionOptions = Object.keys(model?.params.resolutions ?? {}) ;
    const countOptions = model?.params.generate_count_options ?? [1, 2, 3, 4];
    const durationMs = mode === "video" ? model?.params.duration_ms : undefined;
    const durationSeconds = node.metadata?.seconds ? Number(node.metadata.seconds) : Math.round(((durationMs?.min_duration_ms ?? 5000) / 1000));

    const draft: ConfigNodeDraft = {
        model: model?.code,
        ratio: node.metadata?.size || model?.params.aspect_ratio?.default,
        resolution: mode === "image" ? node.metadata?.quality || Object.keys(model?.params.resolutions ?? {})[0] : node.metadata?.vquality || Object.keys(model?.params.resolutions ?? {})[0],
        count: node.metadata?.count ?? model?.params.default_generate_count ?? 1,
        durationSeconds,
    };
    const costCents = model ? estimateCostCents(model, mode === "image" ? { resolution: draft.resolution, count: draft.count } : { resolution: draft.resolution, duration_seconds: draft.durationSeconds, count: 1 }) : null;

    const composerContent = (node.metadata?.composerContent ?? node.metadata?.prompt ?? "").trim();
    const hasAnyInput = Boolean(inputSummary.textCount || inputSummary.imageCount || inputSummary.videoCount || inputSummary.audioCount);
    const canGenerate = Boolean(composerContent || inputSummary.textCount) && Boolean(model);

    return (
        <div className="flex w-full cursor-move flex-col gap-2 rounded-2xl border p-3 text-sm shadow-xl" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
            {node.metadata?.status === "error" ? (
                <div className="rounded-lg border border-red-400/40 bg-red-400/10 p-2 text-[11px] leading-4 text-red-300">
                    {node.metadata?.errorDetails || "生成失败"}
                </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
                <div className="shrink-0 text-sm font-semibold">生成配置</div>
                <div className="flex cursor-default rounded-md p-0.5" style={{ background: theme.node.fill }} onMouseDown={(event) => event.stopPropagation()}>
                    {([
                        { value: "image", label: "生图", icon: <ImageIcon className="size-3.5" /> },
                        { value: "video", label: "视频", icon: <Video className="size-3.5" /> },
                    ] as const).map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs transition"
                            style={mode === option.value ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }}
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={() => onConfigChange(node.id, { generationMode: option.value, model: undefined })}
                        >
                            {option.icon}
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
                <InputChip label="提示词" value={`${inputSummary.textCount} 个`} style={chipStyle} />
                <InputChip label="参考图" value={`${inputSummary.imageCount} 张`} style={chipStyle} />
                <InputChip label="参考视频" value={`${inputSummary.videoCount} 个`} style={chipStyle} />
            </div>

            <div className="grid min-w-0 cursor-default grid-cols-[minmax(0,1fr)_130px_120px] items-center gap-2" onMouseDown={(event) => event.stopPropagation()}>
                <Select value={draft.model ?? ""} onValueChange={(value) => onConfigChange(node.id, { model: value })}>
                    <SelectTrigger className="h-10 w-full rounded-lg border text-xs" style={controlStyle}>
                        <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                        {models.map((item) => (
                            <SelectItem key={item.code} value={item.code} className="text-xs">
                                {item.display_name}
                                {item.badge ? <span className="ml-1 opacity-70">{item.badge}</span> : null}
                            </SelectItem>
                        ))}
                        {!models.length ? <div className="px-2 py-1.5 text-xs opacity-60">无可用模型（联系 admin 配置）</div> : null}
                    </SelectContent>
                </Select>
                <Select value={draft.ratio ?? ""} onValueChange={(value) => onConfigChange(node.id, { size: value })}>
                    <SelectTrigger className="h-10 w-full rounded-lg border text-xs" style={controlStyle}>
                        <SelectValue placeholder="比例" />
                    </SelectTrigger>
                    <SelectContent>
                        {ratioOptions.map((option) => (
                            <SelectItem key={option} value={option} className="text-xs">
                                {option}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={draft.resolution ?? ""} onValueChange={(value) => onConfigChange(node.id, mode === "image" ? { quality: value } : { vquality: value })}>
                    <SelectTrigger className="h-10 w-full rounded-lg border text-xs" style={controlStyle}>
                        <SelectValue placeholder="分辨率" />
                    </SelectTrigger>
                    <SelectContent>
                        {resolutionOptions.map((option) => (
                            <SelectItem key={option} value={option} className="text-xs">
                                {option}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="flex cursor-default items-center gap-2" onMouseDown={(event) => event.stopPropagation()}>
                {mode === "image" ? (
                    <CanvasCameraControl value={node.metadata?.cameraControl} onChange={(cameraControl: CameraControlOptions) => onConfigChange(node.id, { cameraControl })} />
                ) : null}
                {mode === "image" ? (
                    <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: theme.node.fill }}>
                        {countOptions.map((option) => (
                            <button
                                key={option}
                                type="button"
                                className="h-8 w-9 rounded-md text-xs transition"
                                style={draft.count === option ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }}
                                onClick={() => onConfigChange(node.id, { count: option })}
                            >
                                {option}
                            </button>
                        ))}
                        <span className="px-1.5 text-[10px] opacity-60">张</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 rounded-lg border px-2 py-1.5" style={controlStyle}>
                        <span className="text-[11px] opacity-60">时长</span>
                        <input
                            type="number"
                            className="w-14 bg-transparent text-xs outline-none"
                            style={{ color: theme.node.text }}
                            min={Math.round((durationMs?.min_duration_ms ?? 4000) / 1000)}
                            max={Math.round((durationMs?.max_duration_ms ?? 15000) / 1000)}
                            value={draft.durationSeconds}
                            onChange={(event) => onConfigChange(node.id, { seconds: String(event.target.value) })}
                        />
                        <span className="text-[11px] opacity-60">秒</span>
                    </div>
                )}
                <div className="ml-auto text-xs tabular-nums" style={{ color: theme.node.muted }}>
                    {costCents === null ? "价格待定" : formatUsd(costCents)}
                </div>
            </div>

            <textarea
                className="thin-scrollbar min-h-16 w-full resize-none rounded-lg border p-2 text-xs outline-none"
                style={controlStyle}
                placeholder="组装提示词：补充本次生成的描述（上游文本节点会自动拼在前面）"
                value={node.metadata?.composerContent ?? ""}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onWheel={(event) => event.stopPropagation()}
                onChange={(event) => onConfigChange(node.id, { composerContent: event.target.value })}
            />

            <button
                type="button"
                className="mt-auto flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition disabled:opacity-50"
                style={{ background: "#2f80ff", color: "#fff" }}
                disabled={isRunning || !canGenerate}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => onGenerate(node.id)}
            >
                {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
                <span>{costCents !== null && canGenerate ? `${formatUsd(costCents)} · ` : ""}开始生成</span>
            </button>
            {!canGenerate ? <div className="text-center text-[10px] opacity-50">需要描述文字（或连接文本节点）且模型可用</div> : null}
        </div>
    );
}

function InputChip({ label, value, style }: { label: string; value: string; style: React.CSSProperties }) {
    return (
        <div className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px]" style={style}>
            <span>{label}</span>
            <span className="font-medium">{value}</span>
        </div>
    );
}
