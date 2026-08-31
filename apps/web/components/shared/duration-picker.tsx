"use client";

// 时长滑条弹层 — 按原版 1:1 复刻（CONCLUSIONS D9 / §3.5 时长弹层实测，
// 证据 RECON/auth/generate-video-duration/）：点 chip 弹 400×96 弹层 =
// 标题「选择视频生成时长」+ 滑条（轨道+填充+白色滑块）+ 可点刻度 + 数值输入框（带 s 后缀）。
// 滑条域 0→max（视觉同原版），低于下限吸附 min；输入框 placeholder 显示 "min-max"。
import { Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const FILL_COLOR = "rgba(224, 245, 255, 0.2)";
const RAIL_COLOR = "rgba(204, 221, 255, 0.08)";

export function DurationPicker({
  value,
  min,
  max,
  onChange,
  disabled,
  title,
  label = "选择视频生成时长",
}: {
  value: number;
  min: number;
  max: number;
  onChange: (seconds: number) => void;
  disabled?: boolean;
  /** chip hover 提示（原版超长视频 hover 显示「最长可生成3分钟」） */
  title?: string;
  /** 弹层标题（音乐生成等复用时替换） */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) setTimeout(() => document.addEventListener("mousedown", handler));
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const setClamped = (v: number) => onChange(Math.min(Math.max(v, min), max));
  // 刻度与滑条域：0 → max（原版普通 0/5/10/15，超长 0/30/…/180）
  const step = max <= 15 ? 5 : 30;
  const ticks: number[] = [];
  for (let t = 0; t < max; t += step) ticks.push(t);
  ticks.push(max);
  const fillPct = Math.min((value / max) * 100, 100);

  const commitDraft = () => {
    if (draft === null) return;
    const n = Number(draft.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && draft.trim() !== "") setClamped(Math.round(n));
    setDraft(null);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="时长"
        title={title}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-dm-border px-3 font-dm-label text-xs font-medium text-dm-text transition-colors hover:bg-dm-surface-2 disabled:opacity-40"
      >
        <Clock size={13} />
        {value}s
      </button>
      {open && (
        <div
          className="absolute bottom-full right-0 z-50 mb-2 w-[400px] rounded-2xl border border-dm-border-2 bg-[#1c1e22] p-4 shadow-[0_8px_56px_rgba(0,0,0,0.24)]"
          data-testid="duration-popover"
        >
          <p className="mb-3 font-dm-label text-xs font-medium text-[rgba(224,245,255,0.35)]">{label}</p>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <input
                type="range"
                aria-label="生成时长滑条"
                min={0}
                max={max}
                step={1}
                value={Math.min(value, max)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setClamped(v < min ? min : v);
                }}
                className="dm-duration-slider h-3 w-full cursor-pointer appearance-none rounded"
                style={{ background: `linear-gradient(to right, ${FILL_COLOR} 0 ${fillPct}%, ${RAIL_COLOR} ${fillPct}% 100%)` }}
              />
              <div className="mt-0.5 flex items-center justify-between">
                {ticks.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setClamped(t)}
                    className="px-0.5 font-dm-label text-[10px] leading-[14px] text-[rgba(246,247,255,0.7)] transition-colors hover:text-dm-text"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative h-9 w-[90px] shrink-0 rounded-lg bg-[rgba(204,221,255,0.08)]">
              <input
                role="spinbutton"
                aria-valuemin={min}
                aria-valuemax={max}
                aria-valuenow={value}
                inputMode="numeric"
                value={draft ?? String(value)}
                placeholder={`${min}-${max}`}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitDraft();
                }}
                className="h-full w-full rounded-lg bg-transparent pr-[26px] pl-2 font-dm-label text-xs font-medium text-dm-text outline-none placeholder:text-dm-text-4"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-dm-label text-xs text-dm-text-3">s</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
