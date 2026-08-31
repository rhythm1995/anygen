"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUp, AtSign, ChevronDown, Crop, Layers, Plus, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/providers";
import { DurationPicker } from "@/components/shared/duration-picker";
import { VideoComposer } from "@/components/shared/video-composer";
import { useCreationConfig } from "@/components/shared/use-creation-config";
import { api, CREATION_TYPES, formatUsd, type CreationType, type CreationTypesConfig, type ModelEntry } from "@/lib/api";

export interface SubmitPayload {
  type: CreationType;
  prompt: string;
  model_code: string;
  params: Record<string, unknown>;
}

/** 重新编辑回填：generate 页把历史任务参数灌回 composer */
export interface ComposerPrefill {
  type?: CreationType;
  prompt?: string;
  model_code?: string;
  params?: Record<string, unknown>;
}

// 预置音色（平台自有配置；音色克隆管线未接入，见 D7/D11）
const VOICE_PRESETS = [
  { key: "female_warm", label: "温柔女声" },
  { key: "female_bright", label: "明亮女声" },
  { key: "male_deep", label: "沉稳男声" },
  { key: "male_energetic", label: "活力男声" },
  { key: "child", label: "童声" },
];

const TYPE_LABEL: Record<CreationType, string> = {  agent: "Agent 模式",
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

function Popover({ open, onClose, children, width = 340, align = "left" }: { open: boolean; onClose: () => void; children: React.ReactNode; width?: number; align?: "left" | "right" }) {
  const ref = useRef<HTMLDivElement>(null);
  // composer 停靠在视口底部时向上翻转（原站同款行为），否则弹层落到视口外
  const [placement, setPlacement] = useState<"top" | "bottom">("bottom");
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    if (open) {
      setTimeout(() => {
        document.addEventListener("mousedown", handler);
        const anchor = ref.current?.parentElement;
        if (anchor) {
          const rect = anchor.getBoundingClientRect();
          setPlacement(window.innerHeight - rect.bottom < 520 ? "top" : "bottom");
        }
      });
    }
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`absolute ${placement === "top" ? "bottom-11" : "top-11"} ${align === "right" ? "right-0" : "left-0"} z-50 max-h-[480px] overflow-y-auto rounded-2xl border border-dm-border bg-dm-surface p-4 shadow-2xl`}
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
        accent ? "border-transparent bg-transparent text-dm-accent hover:bg-dm-accent-dim" : active ? "border-dm-border-3 bg-dm-surface-2 text-dm-text" : "border-dm-border text-dm-text-2 hover:bg-dm-border"
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
      className="inline-block rounded-[3px] border-[1.5px] border-current"
      style={{ width: Math.max(w * scale, 4), height: Math.max(h * scale, 4) }}
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
  docked = false,
  prefill = null,
}: {
  onSubmit: (payload: AgentSubmitPayload) => void;
  placeholder?: string;
  busy?: boolean;
  error?: string | null;
  initialType?: CreationType;
  skillPicker?: boolean;
  compact?: boolean;
  /** 底部停靠形态：底色亮一档（原站 composer 实测 #1b1c21） */
  docked?: boolean;
  prefill?: ComposerPrefill | null;
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
  const countOptions = model?.params?.generate_count_options ?? [1, 2, 3, 4];
  const [ratio, setRatio] = useState("1:1");
  const [videoRatio, setVideoRatio] = useState("16:9");
  const [imgRes, setImgRes] = useState("2k");
  const [vidRes, setVidRes] = useState("720p");
  const [count, setCount] = useState(2);
  const [durationSec, setDurationSec] = useState(5);
  const [refMode, setRefMode] = useState("first_end_frame");
  // 音乐时长 / 配音音色（引擎未接入前为提交参数，见 D7/D11）
  const [musicDur, setMusicDur] = useState(30);
  const [voice, setVoice] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);

  // prefill 设置 type 时跳过一次 model 重置，否则刚回填的 model_code 会被清掉
  const prefilledTypeRef = useRef<CreationType | null>(null);
  useEffect(() => {
    if (prefilledTypeRef.current === type) {
      prefilledTypeRef.current = null;
      return;
    }
    setModelCode(null);
  }, [type]);
  useEffect(() => {
    // 重新编辑：把历史任务的类型/模型/参数/提示词灌回表单
    if (!prefill) return;
    if (prefill.type) {
      prefilledTypeRef.current = prefill.type;
      setType(prefill.type);
    }
    if (prefill.model_code) setModelCode(prefill.model_code);
    if (typeof prefill.prompt === "string") setText(prefill.prompt);
    const p = (prefill.params ?? {}) as Record<string, unknown>;
    if (typeof p.ratio === "string") (prefill.type === "video" ? setVideoRatio : setRatio)(p.ratio);
    if (typeof p.resolution === "string") (prefill.type === "video" ? setVidRes : setImgRes)(p.resolution);
    if (typeof p.count === "number") setCount(p.count);
    if (typeof p.duration_seconds === "number") setDurationSec(p.duration_seconds);
  }, [prefill]);
  useEffect(() => {
    // 模型切换时钳制数量到该模型支持的范围（如 OpenRouter 模型仅支持 1）
    if (model?.params?.generate_count_options && !model.params.generate_count_options.includes(count)) {
      setCount(model.params.generate_count_options[0]);
    }
  }, [model]);

  // 视频生成走原版大面板形态（CONCLUSIONS D9）；压缩态（历史流 overlay）维持小表单
  if (type === "video" && !compact) {
    return (
      <VideoComposer
        onSubmit={onSubmit}
        busy={busy}
        error={error}
        prefill={prefill}
        onTypeChange={setType}
      />
    );
  }

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
      if (type === "music") params.duration_seconds = musicDur;
      if (type === "dubbing" && voice) params.voice = voice;
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
      <div className={`w-full rounded-2xl border border-dm-border transition-colors focus-within:border-dm-border-3 ${docked ? "bg-dm-composer" : "bg-dm-surface"}`}>
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
              <Popover open={paramsOpen} onClose={() => setParamsOpen(false)} width={920} align="right">
                <p className="mb-3 text-xs text-dm-text-4">选择比例</p>
                <div className="mb-5 flex gap-2">
                  <button
                    onClick={() => setRatio("auto")}
                    className={`flex h-[72px] flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border text-[11px] transition-colors ${
                      ratio === "auto" ? "border-[rgb(224,245,255)] text-dm-text" : "border-dm-border text-dm-text-3 hover:border-dm-border-3"
                    }`}
                  >
                    <Crop size={16} strokeWidth={1.6} />
                    智能
                  </button>
                  {IMAGE_RATIOS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRatio(r)}
                      className={`flex h-[72px] flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border transition-colors ${
                        ratio === r ? "border-[rgb(224,245,255)] text-dm-text" : "border-dm-border text-dm-text-3 hover:border-dm-border-3"
                      }`}
                    >
                      <RatioIcon ratio={r} size={18} />
                      {r}
                    </button>
                  ))}
                </div>
                <p className="mb-3 text-xs text-dm-text-4">选择分辨率</p>
                <div className="mb-5 grid grid-cols-3 gap-2">
                  {IMAGE_RES.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setImgRes(r.key)}
                      className={`h-[52px] rounded-xl border font-dm-label text-sm transition-colors ${
                        imgRes === r.key ? "border-dm-border-3 bg-dm-surface-2 text-dm-text" : "border-dm-border text-dm-text-3 hover:border-dm-border-3"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <p className="mb-3 text-xs text-dm-text-4">选择生成数量</p>
                <div className="grid grid-cols-4 gap-2">
                  {countOptions.map((n) => (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      className={`h-[52px] rounded-xl border text-base transition-colors ${
                        count === n ? "border-dm-border-3 bg-dm-surface-2 text-dm-text" : "border-dm-border text-dm-text-3 hover:border-dm-border-3"
                      }`}
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
                <Popover open={paramsOpen} onClose={() => setParamsOpen(false)} width={560} align="right">
                  <p className="mb-3 text-xs text-dm-text-4">选择比例</p>
                  <div className="mb-5 flex gap-2">
                    {VIDEO_RATIOS.map((r) => (
                      <button
                        key={r}
                        onClick={() => setVideoRatio(r)}
                        className={`flex h-[72px] flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border transition-colors ${
                          videoRatio === r ? "border-[rgb(224,245,255)] text-dm-text" : "border-dm-border text-dm-text-3 hover:border-dm-border-3"
                        }`}
                      >
                        <RatioIcon ratio={r} size={18} />
                        {r}
                      </button>
                    ))}
                  </div>
                  <p className="mb-3 text-xs text-dm-text-4">选择分辨率</p>
                  <div className="grid grid-cols-2 gap-2">
                    {VIDEO_RES.map((r) => (
                      <button
                        key={r.key}
                        onClick={() => setVidRes(r.key)}
                        className={`h-[52px] rounded-xl border font-dm-label text-sm transition-colors ${
                          vidRes === r.key ? "border-dm-border-3 bg-dm-surface-2 text-dm-text" : "border-dm-border text-dm-text-3 hover:border-dm-border-3"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </Popover>
              </div>
              <DurationPicker
                value={durationSec}
                min={4}
                max={15}
                onChange={setDurationSec}
              />
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

          {/* 音乐：时长选择（DurationPicker 复用，提交 params.duration_seconds） */}
          {type === "music" && (
            <div className="relative">
              <DurationPicker value={musicDur} min={10} max={300} onChange={setMusicDur} label="选择音乐生成时长" />
            </div>
          )}
          {/* 配音：音色选择（预置音色真实入参；音色克隆管线未接入如实提示） */}
          {type === "dubbing" && (
            <div className="relative">
              <Chip onClick={() => setVoiceOpen(!voiceOpen)}>
                <Wand2 size={13} />
                {voice ? VOICE_PRESETS.find((v) => v.key === voice)?.label : "克隆声音"}
                <ChevronDown size={12} />
              </Chip>
              <Popover open={voiceOpen} onClose={() => setVoiceOpen(false)} width={240}>
                <p className="mb-2 text-xs text-dm-text-4">选择音色</p>
                {VOICE_PRESETS.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => { setVoice(v.key); setVoiceOpen(false); }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      voice === v.key ? "bg-dm-surface-2 text-dm-text" : "text-dm-text-2 hover:bg-dm-surface-2/60"
                    }`}
                  >
                    {v.label}
                    {voice === v.key && <span className="text-dm-accent">✓</span>}
                  </button>
                ))}
                <div className="my-1 h-px bg-dm-border" />
                <button
                  onClick={() => { setVoiceOpen(false); toast("音色克隆管线未接入，敬请期待"); }}
                  className="flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-sm text-dm-text-2 hover:bg-dm-surface-2/60"
                >
                  <Plus size={13} />
                  克隆新声音
                </button>
              </Popover>
            </div>
          )}

          {/* @ 引用素材（原站底栏同位；上传/引用管线未接入，先如实提示） */}
          <Chip ariaLabel="引用素材" onClick={() => toast("素材引用即将上线")}>
            <AtSign size={14} />
          </Chip>

          <div className="flex-1" />
          {costCents > 0 && (
            <span className="flex items-center gap-1 font-dm-label text-xs text-dm-text-3" data-testid="composer-price">
              <Sparkles size={12} className="text-dm-text-3" />
              {formatUsd(costCents)}
              {type === "image" ? `/张` : type === "video" ? `/${durationSec}s` : ""}
            </span>
          )}
          <button
            aria-label="生成"
            onClick={submit}
            disabled={!text.trim() || busy || (type !== "agent" && !model)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-dm-text text-[#0f0f12] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <ArrowUp size={18} strokeWidth={2.2} />
          </button>
        </div>
      </div>
      {busy && <p className="px-1 pt-2 text-xs text-dm-text-3">生成中…</p>}
      {error && (
        <p className="px-1 pt-2 text-xs text-red-400" data-testid="composer-error">{error}</p>
      )}
      {!session && <p className="px-1 pt-2 text-xs text-dm-text-4">在左侧登录后即可创作。</p>}
    </div>
  );
}
