"use client";

// 视频生成大面板 — 按原版 1:1 复刻（CONCLUSIONS D9 / §3.5，证据 RECON/auth/generate-video/）。
// 结构：左侧参考素材叠卡（±8° 旋转，按参考模式变形）+ 右侧描述区 + 底部工具条
//（类型 accent chip｜模型 chip｜参考模式 chip｜比例+分辨率+数量合并 chip｜时长 chip｜价格｜提交）。
// 尺寸/色值取自抓包计算值：chip 12px/450、高 34-36、radius 8、边框 rgba(204,221,255,0.06)。
import { ArrowLeftRight, ArrowUp, Check, ChevronDown, ChevronUp, Plus, Sparkle } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";

import {
  IconFirstLastFrame,
  IconLongVideo,
  IconOmniReference,
  IconSmartEdit,
  IconSmartMultiFrame,
  IconTypeAgent,
  IconTypeDigitalHuman,
  IconTypeDubbing,
  IconTypeImage,
  IconTypeMotionMimic,
  IconTypeMusic,
  IconTypeVideo,
} from "@/components/shared/jimeng-icons";
import { DurationPicker } from "@/components/shared/duration-picker";
import { useCreationConfig } from "@/components/shared/use-creation-config";
import { formatUsd, type CreationType, type ModelEntry } from "@/lib/api";

export interface VideoSubmitPayload {
  type: "video";
  prompt: string;
  model_code: string;
  params: Record<string, unknown>;
}

export interface ComposerPrefill {
  type?: CreationType;
  prompt?: string;
  model_code?: string;
  params?: Record<string, unknown>;
}

const REFERENCE_MODES = [
  { key: "unified_edit", label: "全能参考", Icon: IconOmniReference, beta: false },
  { key: "first_end_frame", label: "首尾帧", Icon: IconFirstLastFrame, beta: false },
  { key: "smart_multi", label: "智能多帧", Icon: IconSmartMultiFrame, beta: false },
  { key: "smart_edit", label: "智能编辑", Icon: IconSmartEdit, beta: true },
  { key: "long_video", label: "超长视频", Icon: IconLongVideo, beta: true },
] as const;

const TYPES = [
  { key: "agent", label: "Agent 模式", Icon: IconTypeAgent },
  { key: "image", label: "图片生成", Icon: IconTypeImage },
  { key: "video", label: "视频生成", Icon: IconTypeVideo },
  { key: "music", label: "音乐生成", Icon: IconTypeMusic },
  { key: "dubbing", label: "配音生成", Icon: IconTypeDubbing },
  { key: "digital_human", label: "数字人", Icon: IconTypeDigitalHuman },
  { key: "motion_mimic", label: "动作模仿", Icon: IconTypeMotionMimic },
] as const;

const VIDEO_RATIOS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];

/** 占位文案：逐模式照抄原站抓包原文（§3.5） */
function placeholderFor(mode: string): string {
  switch (mode) {
    case "first_end_frame":
      return "输入文字，描述你想创作的画面内容、运动方式等。例如：一个3D形象的小男孩，在公园滑滑板。";
    case "smart_multi":
      return "请添加智能多帧的镜头";
    case "smart_edit":
      return "描述你想修改的内容，例如：把角色A替换成角色B，或使用高级编辑功能对视频画面进行标记、框选";
    default:
      return "上传最多50个参考素材、输入文字或 @ 引用内容，自由组合图、文、音、视频多元素，定义精彩互动。例如：@图片1 模仿 @视频1 的动作，音色参考 @音频1。";
  }
}

/** 模式→首选模型（原站实测：智能多帧匹配 1.0 Fast 档，智能编辑/超长/首尾帧匹配 2.5 档） */
const MODE_PREFERENCE: Record<string, string[]> = {
  first_end_frame: ["dreamina_seedance_45_pro"],
  long_video: ["dreamina_seedance_45_pro"],
  smart_edit: ["dreamina_seedance_45_pro", "dreamina_seedance_40_mini"],
  smart_multi: ["dreamina_ic_generate_video_model_vgfm_3.0_fast", "dreamina_seedance_40_mini"],
  unified_edit: [],
};

function supportsMode(model: ModelEntry, mode: string): boolean {
  const list = model.params.reference_modes;
  return !list || list.includes(mode);
}

function ratioCell(ratio: string) {
  const [w, h] = ratio.split(":").map(Number);
  const scale = 16 / Math.max(w, h);
  return { w: Math.max(Math.round(w * scale), 6), h: Math.max(Math.round(h * scale), 6) };
}

/** 比例小矩形（原版：圆角描边矩形图标 + 下方标签） */
function RatioGlyph({ ratio, active }: { ratio: string; active?: boolean }) {
  const { w, h } = ratioCell(ratio);
  return (
    <span
      className={`inline-block rounded-[4px] border-[1.5px] ${active ? "border-dm-text" : "border-current"}`}
      style={{ width: w, height: h }}
    />
  );
}

function Menu({ open, onClose, children, width, align = "left" }: { open: boolean; onClose: () => void; children: React.ReactNode; width: number; align?: "left" | "right" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    if (open) setTimeout(() => document.addEventListener("mousedown", handler));
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`absolute bottom-full z-50 mb-2 rounded-xl border border-dm-border-2 bg-dm-raised p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] ${align === "right" ? "right-0" : "left-0"}`}
      style={{ width }}
    >
      {children}
    </div>
  );
}

function Chip({
  children,
  onClick,
  accent,
  dashed,
  ariaLabel,
  title,
  chevron,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  accent?: boolean;
  dashed?: boolean;
  ariaLabel?: string;
  title?: string;
  chevron?: "down" | "up";
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 font-dm-label text-xs font-medium transition-colors ${
        accent
          ? "text-dm-accent hover:bg-dm-accent-dim"
          : dashed
            ? "border border-dashed border-dm-border-3 text-dm-text-2 hover:bg-dm-surface-2"
            : "border border-dm-border text-dm-text hover:bg-dm-surface-2"
      }`}
    >
      {children}
      {chevron && (chevron === "up" ? <ChevronUp size={13} className="opacity-70" /> : <ChevronDown size={13} className="opacity-70" />)}
    </button>
  );
}

/** 参考素材叠卡（原版 reference-item ±8° 倾斜、内容随卡倾斜；stack=双层叠卡背卡露出右上；上传管线未接入，点击如实提示） */
function RefTile({ label, kind, tilt = -8, stack = false }: { label: string; kind: "plus" | "upload"; tilt?: number; stack?: boolean }) {
  return (
    <button
      type="button"
      aria-label={`上传${label}`}
      onClick={() => toast("素材上传即将上线")}
      className="group relative h-[80px] w-16 shrink-0"
    >
      {stack && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-lg border border-dm-border-2 bg-dm-surface-2/50"
          style={{ transform: "rotate(8deg) translate(3px,-2px)" }}
        />
      )}
      <span
        className="relative flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dm-border-2 bg-dm-surface-2/70 text-dm-text-3 transition-colors group-hover:border-dm-border-3 group-hover:text-dm-text-2"
        style={{ transform: `rotate(${tilt}deg)` }}
      >
        {kind === "plus" ? <Plus size={16} /> : <ArrowUp size={16} />}
        <span className="text-[11px] leading-none">{label}</span>
      </span>
    </button>
  );
}

export function VideoComposer({
  onSubmit,
  busy,
  error,
  prefill,
  onTypeChange,
}: {
  onSubmit: (payload: VideoSubmitPayload) => void;
  busy?: boolean;
  error?: string | null;
  prefill?: ComposerPrefill | null;
  /** 类型菜单切走 video 时回调宿主（切回小面板形态） */
  onTypeChange: (type: CreationType) => void;
}) {
  const config = useCreationConfig();
  const models = config.data?.modelsByType.video ?? [];
  const availableTypeKeys = new Set((config.data?.modes ?? []).map((m) => m.key as string));

  const [modelCode, setModelCode] = useState<string | null>(null);
  const model: ModelEntry | undefined = models.find((m) => m.code === modelCode) ?? models.find((m) => m.is_default) ?? models[0];

  const [text, setText] = useState("");
  const [menu, setMenu] = useState<null | "type" | "model" | "mode" | "spec">(null);
  const [refMode, setRefMode] = useState<string>("unified_edit");
  const [ratio, setRatio] = useState("16:9");
  const [res, setRes] = useState("720p");
  const [count, setCount] = useState(1);
  const [durationSec, setDurationSec] = useState(5);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // 重新编辑回填（与 CreationComposer 同语义）
  useEffect(() => {
    if (!prefill) return;
    if (prefill.model_code) setModelCode(prefill.model_code);
    if (typeof prefill.prompt === "string") setText(prefill.prompt);
    const p = (prefill.params ?? {}) as Record<string, unknown>;
    if (typeof p.ratio === "string") setRatio(p.ratio);
    if (typeof p.resolution === "string") setRes(p.resolution);
    if (typeof p.count === "number") setCount(p.count);
    if (typeof p.duration_seconds === "number") setDurationSec(p.duration_seconds);
    if (typeof p.reference_mode === "string") setRefMode(p.reference_mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // 模型能力钳制：分辨率不在该模型支持列表 → 回落默认；时长越界 → 回落 5s
  useEffect(() => {
    if (!model) return;
    const resOptions = model.params.resolution?.options;
    if (resOptions && !resOptions.includes(res)) setRes(model.params.resolution?.default ?? resOptions[0] ?? "720p");
    const range = model.params.duration_ms;
    if (range && (durationSec * 1000 < range.min_duration_ms || durationSec * 1000 > range.max_duration_ms)) {
      setDurationSec(Math.max(Math.round(range.min_duration_ms / 1000), 5));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // 模式切换：当前模型不支持 → 自动匹配（原站 toast「已为您匹配至最佳模型」）；时长口径切换
  const switchMode = (next: string) => {
    if (model && !supportsMode(model, next)) {
      const supporters = models.filter((m) => supportsMode(m, next));
      const preferred = (MODE_PREFERENCE[next] ?? []).map((code) => supporters.find((m) => m.code === code)).find(Boolean);
      const target = preferred ?? supporters[0];
      if (target) {
        setModelCode(target.code);
        toast("已为您匹配至最佳模型");
      }
    }
    if (next === "long_video" && durationSec < 30) setDurationSec(30);
    if (refMode === "long_video" && next !== "long_video" && durationSec > 15) setDurationSec(5);
    setRefMode(next);
    setMenu(null);
  };

  const durationRange = model?.params.duration_ms;

  const resOptions = model?.params.resolution?.options ?? ["480p", "720p", "1080p"];
  const isSmartEdit = refMode === "smart_edit";

  const params: Record<string, unknown> = {
    resolution: res,
    ratio,
    duration_seconds: durationSec,
    count,
    reference_mode: refMode,
  };
  const factor = model?.params.resolution_factors?.[res] ?? 1;
  const costCents = model ? Math.ceil(model.price_cents * factor * durationSec * count) : 0;

  const submit = () => {
    if (!text.trim() || busy || !model) return;
    onSubmit({ type: "video", prompt: text.trim(), model_code: model.code, params });
    setText("");
  };

  const toggle = (m: "type" | "model" | "mode" | "spec") => setMenu((cur) => (cur === m ? null : m));

  return (
    <div className="w-full" data-testid="creation-composer">
      <div className="w-full rounded-[20px] border border-dm-border bg-dm-composer transition-colors focus-within:border-dm-border-3">
        {/* 面板主体：参考素材叠卡 + 描述区 */}
        <div className="flex items-start gap-4 px-4 pb-1 pt-5">
          <div className="flex min-h-[96px] items-center gap-3 pl-2">
            {(refMode === "unified_edit" || refMode === "long_video") && <RefTile label="参考内容" kind="plus" stack tilt={-8} />}
            {refMode === "smart_multi" && <RefTile label="空帧" kind="plus" />}
            {refMode === "first_end_frame" && (
              <>
                <RefTile label="首帧" kind="plus" tilt={-8} />
                <ArrowLeftRight size={14} className="shrink-0 text-dm-text-3" />
                <RefTile label="尾帧" kind="plus" tilt={8} />
              </>
            )}
            {refMode === "smart_edit" && (
              <>
                <RefTile label="编辑视频" kind="upload" tilt={-8} />
                <RefTile label="参考内容" kind="plus" tilt={8} />
              </>
            )}
          </div>
          <textarea
            ref={areaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            placeholder={placeholderFor(refMode)}
            rows={3}
            className="mt-1 w-full flex-1 resize-none bg-transparent text-sm leading-[21px] text-dm-text outline-none placeholder:text-dm-text-3"
          />
        </div>

        {/* 底部工具条（原版 chip 顺序） */}
        <div className="relative flex flex-wrap items-center gap-2 px-3 pb-3 pt-2">
          {/* 类型 chip（accent 无边框） */}
          <div className="relative">
            <Chip accent ariaLabel="创作类型" chevron={menu === "type" ? "up" : "down"} onClick={() => toggle("type")}>
              <IconTypeVideo />
              视频生成
            </Chip>
            <Menu open={menu === "type"} onClose={() => setMenu(null)} width={200}>
              <p className="px-2.5 pb-1 pt-1.5 text-[11px] text-dm-text-4">创作类型</p>
              {TYPES.filter((t) => availableTypeKeys.has(t.key)).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    if (t.key !== "video") onTypeChange(t.key);
                  }}
                  className={`flex h-[41px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors ${
                    t.key === "video" ? "bg-dm-surface-2 text-dm-accent" : "text-dm-text-2 hover:bg-dm-surface-2/60"
                  }`}
                >
                  <t.Icon className="shrink-0 text-base" />
                  <span className="flex-1">{t.label}</span>
                  {t.key === "video" && <Check size={14} />}
                </button>
              ))}
            </Menu>
          </div>

          {/* 模型 chip */}
          {model && (
            <div className="relative">
              <Chip ariaLabel="选择模型" onClick={() => toggle("model")}>
                {model.display_name}
                <Sparkle size={12} className="text-dm-accent" />
              </Chip>
              <Menu open={menu === "model"} onClose={() => setMenu(null)} width={420}>
                <p className="truncate px-2.5 pb-1 pt-1.5 text-[11px] text-dm-text-4">选择模型：{model.display_name}</p>
                <div className="max-h-[380px] overflow-y-auto">
                  {models.map((m) => (
                    <button
                      key={m.code}
                      type="button"
                      onClick={() => {
                        setModelCode(m.code);
                        setMenu(null);
                      }}
                      className={`flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                        m.code === model.code ? "bg-dm-surface-2" : "hover:bg-dm-surface-2/60"
                      }`}
                    >
                      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-dm-surface text-dm-text-2">
                        <Sparkle size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-dm-text">
                          {m.display_name}
                          <Sparkle size={11} className="text-dm-accent" />
                          {m.badge && <span className="text-[10px] font-semibold text-dm-accent">{m.badge}</span>}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-dm-text-3">{m.description}</span>
                      </span>
                      {m.code === model.code && <Check size={15} className="mt-2 shrink-0 text-dm-text" />}
                    </button>
                  ))}
                </div>
              </Menu>
            </div>
          )}

          {/* 参考模式 chip */}
          <div className="relative">
            <Chip
              ariaLabel="参考模式"
              chevron={menu === "mode" ? "up" : "down"}
              onClick={() => toggle("mode")}
            >
              {(() => {
                const cur = REFERENCE_MODES.find((r) => r.key === refMode);
                return cur ? <cur.Icon /> : null;
              })()}
              {REFERENCE_MODES.find((r) => r.key === refMode)?.label}
            </Chip>
            <Menu open={menu === "mode"} onClose={() => setMenu(null)} width={190}>
              {REFERENCE_MODES.map((r) => {
                const active = r.key === refMode;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => switchMode(r.key)}
                    className={`flex h-[41px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors ${
                      active ? "bg-dm-surface-2 text-dm-text" : "text-dm-text-2 hover:bg-dm-surface-2/60"
                    }`}
                  >
                    <r.Icon className="shrink-0 text-base" />
                    <span className="flex-1">{r.label}</span>
                    {r.beta && <span className="rounded bg-dm-accent-dim px-1 py-0.5 text-[10px] leading-none text-dm-accent">Beta</span>}
                    {active && <Check size={14} />}
                  </button>
                );
              })}
            </Menu>
          </div>

          {/* 智能编辑：高级编辑虚线 chip */}
          {isSmartEdit && (
            <Chip dashed onClick={() => toast("高级编辑建设中")}>
              高级编辑
            </Chip>
          )}

          {/* 比例 | 分辨率 | 数量 合并 chip（智能编辑显示「自动」） */}
          <div className="relative">
            <Chip ariaLabel="比例与分辨率" onClick={() => toggle("spec")}>
              {isSmartEdit ? (
                <span>自动</span>
              ) : (
                <RatioGlyph ratio={ratio} />
              )}
              {isSmartEdit ? null : <span>{ratio}</span>}
              <span className="text-dm-text-4">|</span>
              <span>{resOptions.includes(res) ? res.replace("p", "P").toUpperCase() : res}</span>
              <Sparkle size={11} className="text-dm-accent" />
              {!isSmartEdit && <span>{count}</span>}
            </Chip>
            <Menu open={menu === "spec"} onClose={() => setMenu(null)} width={330} align="right">
              <p className="px-1 pb-1 pt-0.5 text-xs text-dm-text-4">选择比例</p>
              {/* 原版实测（RECON 30-ratio-styles.json）：格 48×56、间距 2、无边框、选中亮底 pill */}
              <div className="mb-2 grid grid-cols-6 gap-[2px]">
                {VIDEO_RATIOS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRatio(r)}
                    className={`flex h-14 w-12 flex-col items-center justify-center gap-1 rounded-lg text-xs transition-colors ${
                      ratio === r ? "bg-dm-surface-2 text-dm-text" : "text-dm-text-3 hover:text-dm-text-2"
                    }`}
                  >
                    <RatioGlyph ratio={r} active={ratio === r} />
                    {r}
                  </button>
                ))}
              </div>
              <p className="px-1 pb-1 text-xs text-dm-text-4">选择分辨率</p>
              <div className="mb-2 grid grid-cols-3 gap-[2px]">
                {resOptions.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRes(r)}
                    className={`flex h-9 items-center justify-center gap-1 rounded-lg text-xs transition-colors ${
                      res === r ? "bg-dm-surface-2 text-dm-text" : "text-dm-text-3 hover:text-dm-text-2"
                    }`}
                  >
                    {r.replace("p", "P").toUpperCase()}
                    <Sparkle size={10} className="text-dm-accent" />
                  </button>
                ))}
              </div>
              {!isSmartEdit && (
                <>
                  <p className="px-1 pb-1 text-xs text-dm-text-4">选择生成数量</p>
                  <div className="grid grid-cols-4 gap-[2px]">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCount(n)}
                        className={`h-[34px] rounded-lg text-sm transition-colors ${
                          count === n ? "bg-dm-surface-2 text-dm-text" : "text-dm-text-3 hover:text-dm-text-2"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </Menu>
          </div>

          {/* 时长滑条弹层（原版 lv-slider 形态；智能编辑无时长） */}
          {!isSmartEdit && (
            <DurationPicker
              value={durationSec}
              min={refMode === "long_video" ? 30 : (durationRange ? Math.round(durationRange.min_duration_ms / 1000) : 4)}
              max={refMode === "long_video" ? 180 : (durationRange ? Math.round(durationRange.max_duration_ms / 1000) : 15)}
              onChange={setDurationSec}
              title={refMode === "long_video" ? "最长可生成3分钟" : undefined}
            />
          )}

          <div className="flex-1" />
          {model && (
            <span className="flex items-center gap-1 font-dm-label text-xs text-dm-text-3" data-testid="composer-price" title={`${costCents} 美分`}>
              <Sparkle size={12} className="text-dm-text-3" />
              {formatUsd(costCents)}
            </span>
          )}
          <button
            type="button"
            aria-label="生成"
            onClick={submit}
            disabled={!text.trim() || busy || !model}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dm-text text-[#0f0f12] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <ArrowUp size={18} strokeWidth={2.2} />
          </button>
        </div>
      </div>
      {busy && <p className="px-1 pt-2 text-xs text-dm-text-3">生成中…</p>}
      {error && (
        <p className="px-1 pt-2 text-xs text-red-400" data-testid="composer-error">{error}</p>
      )}
    </div>
  );
}
