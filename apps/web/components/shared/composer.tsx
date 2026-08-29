"use client";

import { ArrowUp, AtSign, Paperclip, Sparkles, SlidersHorizontal, Wand2 } from "lucide-react";
import { useRef, useState } from "react";

import { useAuth } from "@/components/providers";

/**
 * Dreamina 大输入卡（home/generate 共用）。
 * token/尺寸对齐 UI-SPEC：bg dm-surface、radius 16px、chips 36px 高。
 */
export function Composer({
  placeholder = 'Start with an idea or script. Add elements with mentions or type "/" for skills.',
  onSubmit,
  compact = false,
  mentionItems = [],
}: {
  placeholder?: string;
  onSubmit?: (prompt: string) => void;
  compact?: boolean;
  mentionItems?: { id: string; label: string }[];
}) {
  const { session } = useAuth();
  const [value, setValue] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (v: string) => {
    setValue(v);
    const m = /@(\w*)$/.exec(v);
    setMentionOpen(Boolean(m));
    setSkillOpen(v.trimEnd().endsWith("/"));
  };

  const pickMention = (label: string) => {
    setValue((prev) => prev.replace(/@(\w*)$/, `@${label} `));
    setMentionOpen(false);
    areaRef.current?.focus();
  };

  const submit = () => {
    if (!value.trim() || !onSubmit) return;
    onSubmit(value.trim());
    setValue("");
  };

  return (
    <div
      data-testid="composer"
      className="w-full rounded-2xl border border-dm-border bg-dm-surface transition-colors focus-within:border-dm-border-3"
    >
      <div className="flex gap-3 px-5 pt-4">
        <button
          aria-label="Add attachment"
          className="mt-1 flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-dm-surface-2 text-dm-text-3 transition-colors hover:text-dm-text-2"
        >
          <Paperclip size={18} />
        </button>
        <div className="relative flex-1">
          <textarea
            ref={areaRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            placeholder={placeholder}
            rows={compact ? 2 : 4}
            className="w-full resize-none bg-transparent text-[15px] text-dm-text outline-none placeholder:text-dm-text-3"
          />
          {mentionOpen && mentionItems.length > 0 && (
            <div className="absolute bottom-2 left-0 z-10 w-60 overflow-hidden rounded-xl border border-dm-border bg-dm-surface-2 shadow-xl">
              {mentionItems.map((m) => (
                <button
                  key={m.id}
                  onClick={() => pickMention(m.label)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-dm-text-2 hover:bg-dm-surface"
                >
                  <AtSign size={13} className="text-dm-accent" />
                  {m.label}
                </button>
              ))}
            </div>
          )}
          {skillOpen && (
            <div className="absolute bottom-2 left-0 z-10 w-64 overflow-hidden rounded-xl border border-dm-border bg-dm-surface-2 shadow-xl">
              <div className="px-3 py-2 text-xs text-dm-text-4">Skills</div>
              {["Cinematic Story Video", "Product Ad", "Character Sheet", "Style Remix"].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setValue((prev) => prev.replace(/\/$/, "") + ` ${s} `);
                    setSkillOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-dm-text-2 hover:bg-dm-surface"
                >
                  <Wand2 size={13} className="text-dm-accent" />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 px-5 pb-4 pt-2">
        <button className="flex h-9 items-center gap-1.5 rounded-lg border border-dm-border px-3 font-dm-label text-xs text-dm-accent transition-colors hover:bg-dm-accent-dim">
          <Sparkles size={13} />
          AI Agent
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <button className="flex h-9 items-center gap-1.5 rounded-lg border border-dm-border px-3 font-dm-label text-xs text-dm-text-2 transition-colors hover:bg-dm-border">
          <SlidersHorizontal size={13} />
          Auto
        </button>
        <button
          aria-label="Mention"
          onClick={() => {
            setValue((prev) => `${prev}@`);
            setMentionOpen(true);
            areaRef.current?.focus();
          }}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-dm-border text-dm-text-2 transition-colors hover:bg-dm-border"
        >
          <AtSign size={13} />
        </button>
        <div className="flex-1" />
        <button
          aria-label="Generate"
          onClick={submit}
          disabled={!value.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-dm-border-3 bg-dm-border-3/60 text-dm-text transition-opacity disabled:opacity-40"
        >
          <ArrowUp size={16} />
        </button>
      </div>
      {!session && !compact && (
        <p className="px-5 pb-3 text-xs text-dm-text-4">Sign in to start creating — new users get 150 free credits.</p>
      )}
    </div>
  );
}
