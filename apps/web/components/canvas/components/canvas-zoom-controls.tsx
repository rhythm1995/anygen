/**
 * 来源：vendor/infinite-canvas（tigerowo/infinite-canvas，AGPL-3.0）— D12 画布 v2 移植
 * shadcn 化：antd Button/Tooltip/Modal → 原生 button + ui/tooltip + ui/dialog
 */
import type { ReactNode } from "react";
import { Compass, Focus, HelpCircle } from "lucide-react";
import { useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "../theme-store";

type CanvasZoomControlsProps = {
    scale: number;
    onScaleChange: (scale: number) => void;
    onReset: () => void;
    isMiniMapOpen: boolean;
    onToggleMiniMap: () => void;
};

export function CanvasZoomControls({ scale, onScaleChange, onReset, isMiniMapOpen, onToggleMiniMap }: CanvasZoomControlsProps) {
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const dockStyle = { background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: colorTheme === "dark" ? "0 18px 45px rgba(0,0,0,.32)" : "0 16px 40px rgba(28,25,23,.12)" };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };

    return (
        <TooltipProvider delayDuration={200}>
            <div className="absolute bottom-5 left-5 z-50" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex h-14 items-center gap-1 rounded-xl border px-2 shadow-lg backdrop-blur" style={dockStyle}>
                <CanvasTip label={isMiniMapOpen ? "关闭小地图" : "打开小地图"}>
                    <button type="button" aria-label={isMiniMapOpen ? "关闭小地图" : "打开小地图"} className="flex size-8 items-center justify-center rounded-md transition" style={isMiniMapOpen ? activeStyle : { color: theme.toolbar.item }} onClick={onToggleMiniMap}>
                        <Compass className="size-4" />
                    </button>
                </CanvasTip>
                <CanvasTip label="重置视图">
                    <button type="button" aria-label="重置视图" className="flex size-8 items-center justify-center rounded-md transition" style={{ color: theme.toolbar.item }} onClick={onReset}>
                        <Focus className="size-4" />
                    </button>
                </CanvasTip>
                <CanvasTip label="放大/缩小画布">
                    <input
                        type="range"
                        min="5"
                        max="500"
                        step="1"
                        value={Math.round(scale * 100)}
                        className="w-24"
                        style={{ accentColor: theme.node.activeStroke }}
                        onChange={(event) => onScaleChange(Number(event.target.value) / 100)}
                        aria-label="放大/缩小画布"
                    />
                </CanvasTip>
                <span className="w-10 text-right text-xs tabular-nums" style={{ color: theme.node.muted }}>
                    {Math.round(scale * 100)}%
                </span>
                <CanvasTip label="快捷键">
                    <button type="button" aria-label="快捷键" className="flex size-8 items-center justify-center rounded-md transition" style={shortcutsOpen ? activeStyle : { color: theme.toolbar.item }} onClick={() => setShortcutsOpen(true)}>
                        <HelpCircle className="size-4" />
                    </button>
                </CanvasTip>
            </div>
            <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>快捷键</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 text-sm" style={{ borderColor: theme.node.stroke }}>
                        <Shortcut label="Space + 拖动" value="临时反转选择/移动工具" />
                        <Shortcut label="滚轮" value="缩放画布" />
                        <Shortcut label="拖动" value="使用当前工具操作画布" />
                        <Shortcut label="Shift / Ctrl / Cmd + 点击" value="追加选择节点" />
                        <Shortcut label="Ctrl / Cmd + G" value="创建组" />
                        <Shortcut label="Ctrl / Cmd + C / V" value="复制 / 粘贴节点" />
                        <Shortcut label="Delete / Backspace" value="删除选中" />
                    </div>
                </DialogContent>
            </Dialog>
            </div>
        </TooltipProvider>
    );
}

function CanvasTip({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent side="top">{label}</TooltipContent>
        </Tooltip>
    );
}

function Shortcut({ label, value }: { label: ReactNode; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-base font-medium">{label}</span>
            <span className="opacity-60">{value}</span>
        </div>
    );
}
