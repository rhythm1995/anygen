"use client";

/**
 * 资产详情弹层（D8，复刻 RECON/auth/asset/30-detail.png）：
 * 左大图（AI生成角标 / ‹ n/n › 翻页 / 右侧上下切换）+ 右栏（下载·收藏·⋯ / 同任务缩略图条 / 图片提示词 / 操作区）。
 * 可用动作真实跳转；未接入的高级编辑动作如实 toast「建设中」（composer 引用管线未接入）。
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download,
  Eraser, Expand, Film, ImagePlus, MoreHorizontal, Pencil, Plus, RefreshCcw, Repeat,
  ScanFace, Sparkles, Star, Type, Wand2, X,
} from "lucide-react";

import { api } from "@/lib/api";

export interface AssetDetailRow {
  id: string;
  kind: string;
  url: string;
  mime: string;
  width: number | null;
  height: number | null;
  favorited: boolean;
  tags: string[];
  meta: { prompt?: string; taskId?: string } & Record<string, unknown>;
  createdAt: string;
}

const ACTION_BUILDING = "功能建设中，敬请期待";

export function AssetDetailDialog({
  assets,
  activeId,
  onActiveChange,
  onClose,
  onToggleFavorite,
  onUpdateTags,
}: {
  assets: AssetDetailRow[];
  activeId: string;
  onActiveChange: (id: string) => void;
  onClose: () => void;
  onToggleFavorite: (a: AssetDetailRow) => void;
  onUpdateTags: (a: AssetDetailRow, tags: string[]) => void;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  const asset = assets.find((a) => a.id === activeId) ?? assets[0];
  const index = assets.findIndex((a) => a.id === asset?.id);
  const prompt = typeof asset?.meta?.prompt === "string" ? asset.meta.prompt : "";

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  // 同任务输出 → 缩略图条（无 taskId 时只有自己）
  const siblings = useMemo(() => {
    const taskId = asset?.meta?.taskId;
    if (!taskId) return asset ? [asset] : [];
    const group = assets.filter((a) => a.meta?.taskId === taskId);
    return group.length > 1 ? group : [asset];
  }, [assets, asset]);

  if (!asset) return null;

  const step = (delta: number) => {
    const next = (index + delta + assets.length) % assets.length;
    onActiveChange(assets[next]!.id);
  };

  const download = () => {
    const a = document.createElement("a");
    a.href = asset.url;
    a.download = asset.url.split("/").pop() ?? "asset";
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  };

  // 重新编辑：复用 generate 页 composer prefill 通道
  const reedit = () => {
    sessionStorage.setItem("pending-prefill", JSON.stringify({
      type: asset.kind === "video" ? "video" : "image",
      prompt,
      params: {},
    }));
    router.push("/ai-tool/generate?prefill=1");
  };

  // 再次生成：直接复跑同参数（合成 pending-generation 自动提交）
  const regenerate = () => {
    if (!prompt) {
      setToast(ACTION_BUILDING);
      return;
    }
    sessionStorage.setItem("pending-generation", JSON.stringify({
      type: asset.kind === "video" ? "video" : "image",
      prompt,
      model_code: (asset.meta.modelCode as string) ?? (asset.kind === "video" ? "dreamina_seedance_45_pro" : "high_aes_general_v50p_large"),
      params: (asset.meta.params as Record<string, unknown>) ?? {},
    }));
    router.push("/ai-tool/generate?auto=1");
  };

  const primaryActions: { label: string; icon: React.ReactNode; onClick: () => void; trailing?: string }[] = [
    {
      label: "生成视频", icon: <Film size={16} />,
      onClick: () => {
        if (!prompt) return setToast(ACTION_BUILDING);
        sessionStorage.setItem("pending-prefill", JSON.stringify({ type: "video", prompt, params: {} }));
        router.push("/ai-tool/generate?prefill=1");
      },
    },
    {
      label: "去画布编辑", icon: <ArrowLeftRight size={16} />, trailing: "›",
      onClick: () => router.push("/ai-tool/assets-canvas"),
    },
  ];

  const editActions = [
    { label: "智能超清", icon: <Wand2 size={16} /> },
    { label: "多角度", icon: <ScanFace size={16} />, badge: "New" },
    { label: "超清", icon: <Sparkles size={16} /> },
    { label: "智能改图", icon: <Pencil size={16} />, badge: "✦" },
    { label: "细节修复", icon: <ImagePlus size={16} /> },
    { label: "局部重绘", icon: <RefreshCcw size={16} /> },
    { label: "扩图", icon: <Expand size={16} /> },
    { label: "消除笔", icon: <Eraser size={16} /> },
    { label: "对口型", icon: <Type size={16} /> },
  ];

  const bottomActions = [
    { label: "重新编辑", icon: <Pencil size={16} />, onClick: reedit },
    { label: "再次生成", icon: <Repeat size={16} />, onClick: regenerate },
    {
      label: "在生成页定位", icon: <ChevronRight size={16} />,
      onClick: () => router.push("/ai-tool/generate"),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex bg-black/90" role="dialog" aria-modal="true" aria-label="资产详情">
      {/* 左侧媒体区 */}
      <div className="relative flex min-w-0 flex-1 items-center justify-center p-16">
        {asset.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.url} alt={prompt || asset.id} className="max-h-full max-w-full rounded-lg object-contain" />
        ) : asset.kind === "video" ? (
          <video src={asset.url} controls autoPlay className="max-h-full max-w-full rounded-lg" />
        ) : (
          <div className="flex h-40 items-center text-sm text-dm-text-3">{asset.mime || asset.kind}</div>
        )}
        {asset.meta.taskId && (
          <span className="absolute left-[3%] top-[6%] rounded-lg border border-white/25 bg-black/45 px-3 py-1.5 text-base text-white/95">
            AI生成
          </span>
        )}
        {/* 底部翻页 */}
        {assets.length > 1 && (
          <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-4 text-white/85">
            <button aria-label="上一个" onClick={() => step(-1)} className="rounded-full p-1 hover:bg-white/10">
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm tabular-nums">{index + 1} / {assets.length}</span>
            <button aria-label="下一个" onClick={() => step(1)} className="rounded-full p-1 hover:bg-white/10">
              <ChevronRight size={18} />
            </button>
          </div>
        )}
        {/* 右侧上下切换（媒体区与面板之间，原站同位） */}
        {assets.length > 1 && (
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 flex-col gap-2 text-white/70">
            <button aria-label="上一张" onClick={() => step(-1)} className="rounded-full p-2 hover:bg-white/10">
              <ChevronUp size={18} />
            </button>
            <button aria-label="下一张" onClick={() => step(1)} className="rounded-full p-2 hover:bg-white/10">
              <ChevronDown size={18} />
            </button>
          </div>
        )}
      </div>

      {/* 关闭 ✕（媒体区右上、面板左外侧，原站同位） */}
      <button
        aria-label="关闭"
        onClick={onClose}
        className="absolute left-[calc(100%-480px-56px)] top-10 rounded-full bg-white/10 p-2 text-white/90 hover:bg-white/20"
      >
        <X size={18} />
      </button>

      {/* 右侧信息面板 */}
      <div className="flex w-[440px] shrink-0 flex-col overflow-y-auto px-7 py-8">
        <div className="flex items-center gap-3">
          <button
            onClick={download}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-dm-surface-2 px-3.5 text-sm text-dm-text transition-colors hover:bg-dm-surface-2/70"
          >
            <Download size={15} />
            下载
          </button>
          <div className="flex-1" />
          <button
            aria-label={asset.favorited ? "取消收藏" : "收藏"}
            onClick={() => onToggleFavorite(asset)}
            className={`rounded-full p-2 transition-colors hover:bg-white/10 ${asset.favorited ? "text-dm-accent" : "text-white/85"}`}
          >
            <Star size={18} fill={asset.favorited ? "currentColor" : "none"} />
          </button>
          <button aria-label="更多" onClick={() => setToast(ACTION_BUILDING)} className="rounded-full p-2 text-white/85 hover:bg-white/10">
            <MoreHorizontal size={18} />
          </button>
        </div>

        {siblings.length > 1 && (
          <div className="mt-6 flex justify-end gap-2">
            {siblings.map((s) => (
              <button
                key={s.id}
                onClick={() => onActiveChange(s.id)}
                className={`h-[72px] w-[72px] overflow-hidden rounded-lg transition-shadow ${
                  s.id === asset.id ? "ring-2 ring-white" : "opacity-80 hover:opacity-100"
                }`}
              >
                {s.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <video src={s.url} className="h-full w-full object-cover" muted />
                )}
              </button>
            ))}
          </div>
        )}

        {prompt && (
          <div className="mt-6 min-h-0">
            <p className="text-xs text-dm-text-3">图片提示词</p>
            <p className="mt-2.5 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-dm-text-2">
              {prompt}
            </p>
          </div>
        )}

        {/* 标签（D11）：增删即保存 */}
        <div className="mt-6">
          <p className="text-xs text-dm-text-3">标签</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {asset.tags.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-md bg-dm-surface-2 px-2 py-1 text-xs text-dm-text-2">
                {t}
                <button
                  aria-label={`删除标签 ${t}`}
                  onClick={() => onUpdateTags(asset, asset.tags.filter((x) => x !== t))}
                  className="text-dm-text-4 hover:text-dm-text-2"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            <span className="flex items-center gap-1 rounded-md border border-dm-border px-2 py-1">
              <Plus size={11} className="text-dm-text-4" />
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const t = tagInput.trim().slice(0, 24);
                  if (!t || asset.tags.includes(t)) return;
                  onUpdateTags(asset, [...asset.tags, t]);
                  setTagInput("");
                }}
                onBlur={() => {
                  const t = tagInput.trim().slice(0, 24);
                  if (t && !asset.tags.includes(t)) {
                    onUpdateTags(asset, [...asset.tags, t]);
                  }
                  setTagInput("");
                }}
                placeholder="添加标签"
                maxLength={24}
                className="w-20 bg-transparent text-xs text-dm-text outline-none placeholder:text-dm-text-4"
              />
            </span>
          </div>
        </div>

        <div className="mt-auto pt-8">
          <ActionCard>
            <div className="grid grid-cols-2 gap-y-4">
              {primaryActions.map((a) => (
                <ActionItem key={a.label} {...a} />
              ))}
              <ActionItem label="用作参考图" icon={<ImagePlus size={16} />} onClick={() => setToast(ACTION_BUILDING)} />
            </div>
          </ActionCard>

          <ActionCard className="mt-3">
            <div className="grid grid-cols-2 gap-y-4">
              {editActions.map((a) => (
                <ActionItem key={a.label} label={a.label} icon={a.icon} badge={a.badge} onClick={() => setToast(ACTION_BUILDING)} />
              ))}
            </div>
          </ActionCard>

          <ActionCard className="mt-3 mb-2">
            <div className="grid grid-cols-2 gap-y-4">
              {bottomActions.map((a) => (
                <ActionItem key={a.label} label={a.label} icon={a.icon} onClick={a.onClick} />
              ))}
            </div>
          </ActionCard>
        </div>
      </div>

      {toast && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-lg bg-dm-surface-2 px-4 py-2 text-sm text-dm-text shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function ActionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-dm-raised px-5 py-4 ${className}`}>{children}</div>;
}

function ActionItem({
  label, icon, onClick, trailing, badge,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  trailing?: string;
  badge?: string;
}) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 text-left text-[13px] text-dm-text transition-colors hover:text-dm-accent">
      <span className="text-dm-text-2">{icon}</span>
      {label}
      {badge && <span className="rounded bg-dm-accent-dim px-1 py-px text-[10px] text-dm-accent">{badge}</span>}
      {trailing && <span className="text-dm-text-3">{trailing}</span>}
    </button>
  );
}
