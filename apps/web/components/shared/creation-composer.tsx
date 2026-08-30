"use client";

import { useQuery } from "@tanstack/react-query";
import { AtSign, ChevronDown, Clock, Crop, Layers, Sparkles, Wand2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/providers";
import { api, CREATION_TYPES, formatUsd, type CreationType, type CreationTypesConfig, type ModelEntry } from "@/lib/api";

export interface SubmitPayload {
  type: CreationType;
  prompt: string;
  model_code: string;
  params: Record<string, unknown>;
}

const TYPE_LABEL: Record<CreationType, string> = {
  agent: "Agent 模式",
  image: "图片生成",
  video: "视频生成",
  music: "音乐生成",
  dubbing: "配音生成",
  digital_human: "数字人",
  motion_mimic: "动作模仿",
};

const IMAGE_RATIOS = ["1:1", "21:9", "16:9", "3:2", "4:3", "3:4", "2:3", "9:16"];
const VIDEO_RATIOS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
const IMAGE_RES = [
  { key: "1.5k", label: "标清 1.5K" },
  { key: "2k", label: "高清 2K" },
  { key: "4k", label: "超清 4K" },
];
const VIDEO_RES = [
  { key: "480p", label: "480P" },
  { key: "720p", label: "720P" },
  { key: "1080p", label: "1080P" },
];
const REFERENCE_MODES = [
  { key: "unified_edit", label: "全能参考" },
  { key: "first_end_frame", label: "首尾帧" },
  { key: "smart_multi", label: "智能多帧" },
  { key: "smart_edit", label: "智能编辑", badge: "Beta" },
  { key: "long_video", label: "超长视频", badge: "Beta" },
];

function useCreationConfig() {
  return useQuery({
    queryKey: ["creation-types"],
    queryFn: () => api<CreationTypesConfig>("/config/creation-types"),
    staleTime: 5 * 60_000,
  });
}

function Popover({ open, onClose, children, width = 340 }: { open: boolean; onClose: () => void; children: React.ReactNode; width?: number }) {
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
      className="absolute left-0 top-11 z-50 max-h-[480px] overflow-y-auto rounded-2xl border border-dm-border bg-dm-surface p-4 shadow-2xl"
      style={{ width }}
    >
      {children}
    </div>
  );
}

function Chip({ children, active, accent, onClick, ariaLabel }: { children: React.ReactNode; active?: boolean; accent?: boolean; onClick?: () => void; ariaLabel?: string }) {
  return (
    <button
      aria-label={ariaLabel}
      onClick={onClick}
      className={`relative flex h-9 items-center gap-1.5 rounded-lg border px-3 font-dm-label text-xs transition-colors ${
        accent ? "border-dm-border bg-dm-accent-dim text-dm-accent" : active ? "border-dm-border-3 bg-dm-surface-2 text-dm-text" : "border-dm-border text-dm-text-2 hover:bg-dm-border"
      }`}
    >
      {children}
    </button>
  );
}

/** 比例小矩形 */
function RatioIcon({ ratio, size = 14 }: { ratio: string; size?: number }) {
  const [w, h] = ratio.split(":").map(Number);
  const scale = size / Math.max(w, h);
  return (
    <span
      className="inline-block rounded-[2px] border-[1.5px] border-current"
      style={{ width: Math.max(w * scale, 3), height: Math.max(h * scale, 3) }}
    />
  );
}

export interface AgentSubmitPayload extends SubmitPayload {
  skill_id?: string;
}

export function CreationComposer({
  onSubmit,
  placeholder = "说点什么，描述你的想法，@ 引用素材，/ 唤起技能",
  busy,
  error,
  initialType = "agent",
  skillPicker = false,
  compact = false,
}: {
  onSubmit: (payload: AgentSubmitPayload) => void;
  placeholder?: string;
  busy?: boolean;
  error?: string | null;
  initialType?: CreationType;
  skillPicker?: boolean;
  compact?: boolean;
}) {
  const { session } = useAuth();
  const config = useCreationConfig();
  const [type, setType] = useState<CreationType>(initialType);
  const [typeOpen, setTypeOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [text, setText] = useState("");
  const [skillOpen, setSkillOpen] = useState(false);
  const [skill, setSkill] = useState<{ id: string; name: string } | null>(null);
  const skillsQuery = useQuery({
    queryKey: ["agent-skills"],
    queryFn: () => api<{ id: string; name: string; title: string; description: string; official: boolean; step_count: number }[]>("/agent/skills"),
    enabled: skillPicker && Boolean(session),
  });
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const models = (config.data?.modelsByType[type] ?? []);
  const [modelCode, setModelCode] = useState<string | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const model: ModelEntry | undefined = models.find((m) => m.code === modelCode) ?? models.find((m) => m.is_default) ?? models[0];

  // 参数状态（按类型）
  const [ratio, setRatio] = useState("1:1");
  const [videoRatio, setVideoRatio] = useState("16:9");
  const [imgRes, setImgRes] = useState("2k");
  const [vidRes, setVidRes] = useState("720p");
  const [count, setCount] = useState(2);
  const [durationSec, setDurationSec] = useState(5);
  const [refMode, setRefMode] = useState("first_end_frame");

  useEffect(() => {
    setModelCode(null);
  }, [type]);

  const params: Record<string, unknown> = {};
  let costCents = 0;
  if (model) {
    if (type === "image") {
      params.resolution = imgRes;
      params.ratio = ratio;
      params.count = count;
      const factor = model.params.resolutions?.[imgRes]?.factor ?? 1;
      costCents = Math.ceil(model.price_cents * factor * count);
    } else if (type === "video") {
      params.resolution = vidRes;
      params.ratio = videoRatio;
      params.duration_seconds = durationSec;
      params.reference_mode = refMode;
      const factor = model.params.resolution_factors?.[vidRes] ?? 1;
      costCents = Math.ceil(model.price_cents * durationSec * factor);
    } else {
      costCents = model.price_cents;
      if (type === "motion_mimic") params.style = "生动";
    }
  }

  const submit = () => {
    if (!text.trim() || busy) return;
    if (type === "agent") {
      console.log("[composer] agent submit, skill =", JSON.stringify(skill));
      onSubmit({ type, prompt: text.trim(), model_code: skill?.id ?? "", skill_id: skill?.id, params: { skill_id: skill?.id } });
      setText("");
      return;
    }
    if (!model) return;
    onSubmit({ type, prompt: text.trim(), model_code: model.code, params });
    setText("");
  };

  const modes = (config.data?.modes ?? []).filter((m) => CREATION_TYPES.includes(m.key as CreationType));

  return (
    <div className="w-full" data-testid="creation-composer">
      <div className="w-full rounded-2xl border border-dm-border bg-dm-surface transition-colors focus-within:border-dm-border-3">
        <div className="px-5 pt-4">
          <textarea
            ref={areaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            placeholder={placeholder}
            rows={compact ? 2 : 3}
            className="w-full resize-none bg-transparent text-[15px] text-dm-text outline-none placeholder:text-dm-text-3"
          />
        </div>
        <div className="relative flex flex-wrap items-center gap-2 px-5 pb-4 pt-2">
          {/* 创作类型 */}
          <div className="relative">
            <Chip accent ariaLabel="创作类型" onClick={() => { setTypeOpen(!typeOpen); setParamsOpen(false); setModelOpen(false); }}>
              <Sparkles size={13} />
              {TYPE_LABEL[type]}
              <ChevronDown size={12} />
            </Chip>
            <Popover open={typeOpen} onClose={() => setTypeOpen(false)} width={280}>
              <p className="mb-2 text-xs text-dm-text-4">创作类型</p>
              {modes.map((m) => (
                <button
                  key={m.key}
                  onClick={() => { setType(m.key as CreationType); setTypeOpen(false); }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    type === m.key ? "bg-dm-surface-2 text-dm-text" : "text-dm-text-2 hover:bg-dm-surface-2/60"
                  }`}
                >
                  <span className="w-4 text-center">{m.key === "agent" ? <Sparkles size={14} /> : m.key === "image" ? "🖼" : m.key === "video" ? "🎬" : m.key === "music" ? "🎵" : m.key === "dubbing" ? "🎙" : m.key === "digital_human" ? "👤" : "🕺"}</span>
                  <span className="flex-1">{m.label}</span>
                  {type === m.key && <span className="text-dm-accent">✓</span>}
                </button>
              ))}
            </Popover>
          </div>

          {/* 模型下拉（image/video/music/digital_human/motion_mimic） */}
          {model && type !== "dubbing" && type !== "agent" && (
            <div className="relative">
              <Chip onClick={() => { setModelOpen(!modelOpen); setTypeOpen(false); setParamsOpen(false); }}>
                <Layers size={13} />
                {model.display_name}
                {model.badge && <span className="rounded bg-dm-accent-dim px-1 text-[9px] text-dm-accent">{model.badge}</span>}
                <ChevronDown size={12} />
              </Chip>
              <Popover open={modelOpen} onClose={() => setModelOpen(false)} width={420}>
                {model.description && <p className="mb-2 text-xs text-dm-text-4">选择模型：{model.display_name} · {model.description.slice(0, 24)}…</p>}
                <div className="max-h-[360px] overflow-y-auto">
                  {models.map((m) => (
                    <button
                      key={m.code}
                      onClick={() => { setModelCode(m.code); setModelOpen(false); }}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        m.code === model.code ? "bg-dm-surface-2" : "hover:bg-dm-surface-2/60"
                      }`}
                    >
                      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-dm-surface text-dm-text-3">✦</span>
                      <span className="flex-1">
                        <span className="flex items-center gap-1.5 text-sm text-dm-text">
                          {m.display_name}
                          {m.badge && <span className="rounded bg-dm-accent-dim px-1 text-[9px] text-dm-accent">{m.badge}</span>}
                        </span>
                        <span className="block text-xs text-dm-text-3">{m.description}</span>
                        <span className="mt-0.5 block text-[10px] text-dm-text-4">{formatUsd(m.price_cents)}{m.unit_type === "per_second" ? "/秒" : m.unit_type === "per_image" ? "/张" : ""}
                        </span>
                      </span>
                      {m.code === model.code && <span className="text-dm-accent">✓</span>}
                    </button>
                  ))}
                </div>
              </Popover>
            </div>
          )}

          {/* 图片参数 */}
          {type === "image" && model && (
            <div className="relative">
              <Chip onClick={() => { setParamsOpen(!paramsOpen); setTypeOpen(false); setModelOpen(false); }}>
                <Crop size={13} />
                {ratio} | {imgRes.toUpperCase()}
                <span className="text-dm-text-4">|</span>
                {count}
                <ChevronDown size={12} />
              </Chip>
              <Popover open={paramsOpen} onClose={() => setParamsOpen(false)} width={460}>
                <p className="mb-2 text-xs text-dm-text-4">选择比例</p>
                <div className="mb-3 grid grid-cols-9 gap-1">
                  <button className={`flex flex-col items-center rounded-lg border py-2 text-[10px] ${"border-dm-border text-dm-text-2"}`}><Crop size={13} />智能</button>
                  {IMAGE_RATIOS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRatio(r)}
                      className={`flex flex-col items-center rounded-lg border py-2 text-[10px] ${ratio === r ? "border-dm-border-3 bg-dm-surface-2 text-dm-text" : "border-dm-border text-dm-text-3"}`}
                    >
                      <RatioIcon ratio={r} />
                      {r}
                    </button>
                  ))}
                </div>
                <p className="mb-2 text-xs text-dm-text-4">选择分辨率</p>
                <div className="mb-3 grid grid-cols-3 gap-1">
                  {IMAGE_RES.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setImgRes(r.key)}
                      className={`rounded-lg border py-2 font-dm-label text-xs ${imgRes === r.key ? "border-dm-border-3 bg-dm-surface-2 text-dm-text" : "border-dm-border text-dm-text-3"}`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <p className="mb-2 text-xs text-dm-text-4">选择生成数量</p>
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      className={`rounded-lg border py-2 text-sm ${count === n ? "border-dm-border-3 bg-dm-surface-2 text-dm-text" : "border-dm-border text-dm-text-3"}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </Popover>
            </div>
          )}

          {/* 视频参数 */}
          {type === "video" && model && (
            <>
              <div className="relative">
                <Chip onClick={() => { setParamsOpen(!paramsOpen); setTypeOpen(false); setModelOpen(false); }}>
                  <Wand2 size={13} />
                  {REFERENCE_MODES.find((r) => r.key === refMode)?.label}
                  <ChevronDown size={12} />
                </Chip>
                <Popover open={paramsOpen} onClose={() => setParamsOpen(false)} width={240}>
                  {REFERENCE_MODES.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => { setRefMode(r.key); setParamsOpen(false); }}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${refMode === r.key ? "bg-dm-surface-2 text-dm-text" : "text-dm-text-2 hover:bg-dm-surface-2/60"}`}
                    >
                      <span className="flex-1">{r.label}</span>
                      {r.badge && <span className="rounded bg-dm-accent-dim px-1 text-[9px] text-dm-accent">{r.badge}</span>}
                      {refMode === r.key && <span className="text-dm-accent">✓</span>}
                    </button>
                  ))}
                </Popover>
              </div>
              <div className="relative">
                <Chip onClick={() => { setParamsOpen(!paramsOpen); setTypeOpen(false); setModelOpen(false); }}>
                  <Crop size={13} />
                  {videoRatio} | {vidRes.toUpperCase()}
                  <ChevronDown size={12} />
                </Chip>
                <Popover open={paramsOpen} onClose={() => setParamsOpen(false)} width={380}>
                  <p className="mb-2 text-xs text-dm-text-4">选择比例</p>
                  <div className="mb-3 grid grid-cols-6 gap-1">
                    {VIDEO_RATIOS.map((r) => (
                      <button
                        key={r}
                        onClick={() => setVideoRatio(r)}
                        className={`flex flex-col items-center rounded-lg border py-2 text-[10px] ${videoRatio === r ? "border-dm-border-3 bg-dm-surface-2 text-dm-text" : "border-dm-border text-dm-text-3"}`}
                      >
                        <RatioIcon ratio={r} />
                        {r}
                      </button>
                    ))}
                  </div>
                  <p className="mb-2 text-xs text-dm-text-4">选择分辨率</p>
                  <div className="grid grid-cols-3 gap-1">
                    {VIDEO_RES.map((r) => (
                      <button
                        key={r.key}
                        onClick={() => setVidRes(r.key)}
                        className={`rounded-lg border py-2 font-dm-label text-xs ${vidRes === r.key ? "border-dm-border-3 bg-dm-surface-2 text-dm-text" : "border-dm-border text-dm-text-3"}`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </Popover>
              </div>
              <Chip ariaLabel="时长" onClick={() => setDurationSec(durationSec === 5 ? 10 : durationSec === 10 ? 4 : 5)}>
                <Clock size={13} />
                {durationSec}s
              </Chip>
            </>
          )}

          {/* 技能选择（Agent 模式） */}
          {skillPicker && type === "agent" && (
            <div className="relative">
              <Chip onClick={() => { setSkillOpen(!skillOpen); setTypeOpen(false); setParamsOpen(false); setModelOpen(false); }}>
                <Wand2 size={13} />
                {skill ? skill.name : "技能"}
                <ChevronDown size={12} />
              </Chip>
              <Popover open={skillOpen} onClose={() => setSkillOpen(false)} width={420}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-dm-text-4">官方技能</span>
                  {skill && (
                    <button className="text-[10px] text-dm-accent" onClick={() => setSkill(null)}>
                      清除
                    </button>
                  )}
                </div>
                {(skillsQuery.data ?? []).map((sk) => (
                  <button
                    key={sk.id}
                    onClick={() => { setSkill({ id: sk.id, name: sk.name }); setSkillOpen(false); }}
                    className="w-full rounded-lg px-2 py-2 text-left hover:bg-dm-surface-2/60"
                  >
                    <span className="flex items-center gap-2 text-sm text-dm-text">
                      {sk.name}
                      {sk.official && <span className="rounded bg-dm-surface-2 px-1 text-[9px] text-dm-text-3">官方</span>}
                      <span className="ml-auto text-[10px] text-dm-text-4">{sk.step_count} 步</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-dm-text-3">{sk.description}</span>
                  </button>
                ))}
              </Popover>
            </div>
          )}

          {/* 音乐：智能时长 */}
          {type === "music" && <Chip><Clock size={13} />智能时长</Chip>}
          {/* 配音：克隆声音 */}
          {type === "dubbing" && <Chip><Wand2 size={13} />克隆声音</Chip>}

          <div className="flex-1" />
          <button
            aria-label="生成"
            onClick={submit}
            disabled={!text.trim() || busy || (type !== "agent" && !model)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-dm-border-3 bg-dm-border-3/60 text-dm-text transition-opacity disabled:opacity-40"
          >
            ↑
          </button>
        </div>
        {costCents > 0 && (
          <p className="px-5 pb-3 text-[11px] text-dm-text-4">预计消耗 {formatUsd(costCents)}</p>
        )}
      </div>
      {busy && <p className="px-1 pt-2 text-xs text-dm-text-3">生成中…</p>}
      {error && (
        <p className="px-1 pt-2 text-xs text-red-400" data-testid="composer-error">{error}</p>
      )}
      {!session && <p className="px-1 pt-2 text-xs text-dm-text-4">在左侧登录后即可创作。</p>}
    </div>
  );
}
