"use client";

import { ArrowUp, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { uploadImageFile } from "@/components/canvas/utils/canvas-image-data";

export type MediaRef = {
  url: string;
  assetId: string;
  kind: "image" | "video" | "audio";
  name: string;
};

function kindOf(mime: string): MediaRef["kind"] {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "image";
}

export async function uploadMediaFile(file: File): Promise<MediaRef> {
  const uploaded = await uploadImageFile(file);
  return { url: uploaded.url, assetId: uploaded.assetId, kind: kindOf(file.type), name: file.name };
}

export function MediaRefTile({
  label,
  kind = "plus",
  tilt = -8,
  stack = false,
  accept = "image/*,video/mp4,video/quicktime,audio/mpeg,audio/wav",
  multiple = true,
  value,
  onChange,
}: {
  label: string;
  kind?: "plus" | "upload";
  tilt?: number;
  stack?: boolean;
  accept?: string;
  multiple?: boolean;
  value: MediaRef[];
  onChange: (next: MediaRef[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const preview = value[0];

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const uploaded: MediaRef[] = [];
      for (const file of Array.from(files).slice(0, multiple ? 12 : 1)) {
        uploaded.push(await uploadMediaFile(file));
      }
      onChange(multiple ? [...value, ...uploaded] : uploaded);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="group relative h-[80px] w-16 shrink-0">
      {stack && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-lg border border-dm-border-2 bg-dm-surface-2/50"
          style={{ transform: "rotate(8deg) translate(3px,-2px)" }}
        />
      )}
      <button
        type="button"
        aria-label={`上传${label}`}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="relative flex h-full w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-dm-border-2 bg-dm-surface-2/70 text-dm-text-3 transition-colors hover:border-dm-border-3 hover:text-dm-text-2 disabled:opacity-50"
        style={{ transform: `rotate(${tilt}deg)` }}
      >
        {preview ? (
          preview.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt="" className="h-full w-full object-cover" />
          ) : preview.kind === "video" ? (
            <video src={preview.url} className="h-full w-full object-cover" muted />
          ) : (
            <span className="px-1 text-[10px] leading-tight">音频 {value.length}</span>
          )
        ) : (
          <>
            {kind === "plus" ? <Plus size={16} /> : <ArrowUp size={16} />}
            <span className="text-[11px] leading-none">{busy ? "上传中" : label}</span>
          </>
        )}
        {value.length > 1 ? (
          <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[9px] text-white">{value.length}</span>
        ) : null}
      </button>
      {preview ? (
        <button
          type="button"
          aria-label={`清除${label}`}
          className="absolute -right-1 -top-1 z-10 hidden rounded-full bg-dm-surface p-0.5 text-dm-text-3 group-hover:block"
          onClick={(e) => {
            e.stopPropagation();
            onChange([]);
          }}
        >
          <X size={10} />
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => void pick(e.target.files)}
      />
    </div>
  );
}
