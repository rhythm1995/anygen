"use client";

/**
 * 智能编辑「高级编辑」：本地矩形标注（D14）。
 * 不是原站框选编辑器；区域归一化后写入 prompt。
 */
import { useRef, useState } from "react";

export type VideoMark = { x: number; y: number; w: number; h: number };

export function formatVideoMarks(marks: VideoMark[]): string {
  if (!marks.length) return "";
  return (
    "编辑标记：" +
    marks
      .map((m, i) => `区域${i + 1}(${Math.round(m.x * 100)}%,${Math.round(m.y * 100)}%,${Math.round(m.w * 100)}%×${Math.round(m.h * 100)}%)`)
      .join("；")
  );
}

export function VideoMarkDialog({
  src,
  onClose,
  onApply,
}: {
  src: string;
  onClose: () => void;
  onApply: (marks: VideoMark[]) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [marks, setMarks] = useState<VideoMark[]>([]);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const rel = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70" role="dialog" aria-label="高级编辑">
      <div className="w-[min(920px,92vw)] rounded-2xl border border-dm-border bg-dm-surface p-4">
        <p className="mb-2 text-sm text-dm-text">在视频上拖拽框选要修改的区域（本地标注，随描述提交）</p>
        <div
          ref={wrapRef}
          className="relative aspect-video w-full cursor-crosshair overflow-hidden rounded-lg bg-black"
          onPointerDown={(e) => {
            const p = rel(e);
            setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!draft) return;
            const p = rel(e);
            setDraft({ ...draft, x1: p.x, y1: p.y });
          }}
          onPointerUp={() => {
            if (!draft) return;
            const x = Math.min(draft.x0, draft.x1);
            const y = Math.min(draft.y0, draft.y1);
            const w = Math.abs(draft.x1 - draft.x0);
            const h = Math.abs(draft.y1 - draft.y0);
            if (w > 0.02 && h > 0.02) setMarks((cur) => [...cur, { x, y, w, h }]);
            setDraft(null);
          }}
        >
          <video src={src} className="h-full w-full object-contain" controls />
          {marks.map((m, i) => (
            <span
              key={i}
              className="pointer-events-none absolute border-2 border-dm-accent bg-dm-accent/10"
              style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}
            />
          ))}
          {draft ? (
            <span
              className="pointer-events-none absolute border-2 border-white/80"
              style={{
                left: `${Math.min(draft.x0, draft.x1) * 100}%`,
                top: `${Math.min(draft.y0, draft.y1) * 100}%`,
                width: `${Math.abs(draft.x1 - draft.x0) * 100}%`,
                height: `${Math.abs(draft.y1 - draft.y0) * 100}%`,
              }}
            />
          ) : null}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="text-xs text-dm-text-3" onClick={() => setMarks([])}>
            清空
          </button>
          <div className="flex-1" />
          <button type="button" className="text-xs text-dm-text-4" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="rounded-lg bg-dm-accent px-3 py-1.5 text-xs text-[#04252a]"
            onClick={() => onApply(marks)}
          >
            应用 {marks.length ? `(${marks.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
