"use client";
/**
 * 全屏预览壳（共享组件）：资产详情弹层（D8）骨架提取——
 * fixed inset 遮罩 + 左媒体区（底部 ‹n/n› 翻页 + 右侧上下切换）+ 右 440px 信息面板。
 * Esc 关闭、←/→ 翻页；提示词中心已接入，资产弹层后续可切换同壳（减少重复）。
 */
import { useEffect, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from "lucide-react";

export function FullscreenPreview({
  open,
  onClose,
  index,
  total,
  onStep,
  media,
  ariaLabel = "全屏预览",
  children,
}: {
  open: boolean;
  onClose: () => void;
  index: number;
  total: number;
  onStep: (delta: number) => void;
  media: ReactNode;
  ariaLabel?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") onStep(-1);
      else if (event.key === "ArrowRight") onStep(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onStep]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/90" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      {/* 左侧媒体区 */}
      <div className="relative flex min-w-0 flex-1 items-center justify-center p-16">
        {media}
        {/* 底部翻页 */}
        {total > 1 ? (
          <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-4 text-white/85">
            <button aria-label="上一个" onClick={() => onStep(-1)} className="rounded-full p-1 hover:bg-white/10">
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm tabular-nums">{index + 1} / {total}</span>
            <button aria-label="下一个" onClick={() => onStep(1)} className="rounded-full p-1 hover:bg-white/10">
              <ChevronRight size={18} />
            </button>
          </div>
        ) : null}
        {/* 右侧上下切换 */}
        {total > 1 ? (
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 flex-col gap-2 text-white/70">
            <button aria-label="上一张" onClick={() => onStep(-1)} className="rounded-full p-2 hover:bg-white/10">
              <ChevronUp size={18} />
            </button>
            <button aria-label="下一张" onClick={() => onStep(1)} className="rounded-full p-2 hover:bg-white/10">
              <ChevronDown size={18} />
            </button>
          </div>
        ) : null}
      </div>

      {/* 关闭 ✕（媒体区右上、面板左外侧） */}
      <button aria-label="关闭" onClick={onClose} className="absolute left-[calc(100%-480px-56px)] top-10 rounded-full bg-white/10 p-2 text-white/90 hover:bg-white/20">
        <X size={18} />
      </button>

      {/* 右侧信息面板 */}
      <div className="thin-scrollbar flex w-[440px] shrink-0 flex-col overflow-y-auto px-7 py-8">{children}</div>
    </div>
  );
}
