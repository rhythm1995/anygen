"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";

import { useAuth } from "@/components/providers";
import { api } from "@/lib/api";

const KINDS = [
  { key: "", label: "全部" },
  { key: "image", label: "图片" },
  { key: "video", label: "视频" },
  { key: "audio", label: "音频" },
  { key: "doc", label: "文档" },
  { key: "element", label: "元素" },
];

interface AssetRow {
  id: string;
  kind: string;
  storageKey: string;
  url: string;
  mime: string;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export default function AssetsPage() {
  const { session, loading } = useAuth();
  const qc = useQueryClient();
  const [kind, setKind] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assets = useQuery({
    queryKey: ["assets", kind],
    enabled: Boolean(session),
    queryFn: () => api<AssetRow[]>(`/assets${kind ? `?kind=${kind}` : ""}`),
  });

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const kindMap: Record<string, "image" | "video" | "audio" | "doc"> = {
        "image/": "image", "video/": "video", "audio/": "audio", "application/pdf": "doc",
      };
      const assetKind = Object.entries(kindMap).find(([p]) => file.type.startsWith(p))?.[1] ?? "element";
      const presign = await api<{ url: string; key: string; publicUrl: string }>("/assets/presign", {
        method: "POST",
        body: { filename: file.name, contentType: file.type || "application/octet-stream", kind: assetKind },
      });
      const put = await fetch(presign.url, { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
      if (!put.ok) throw new Error(`直传失败 HTTP ${put.status}`);
      await api("/assets", {
        method: "POST",
        body: { key: presign.key, kind: assetKind, mime: file.type || "application/octet-stream", sizeBytes: file.size },
      });
      qc.invalidateQueries({ queryKey: ["assets"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    await api(`/assets/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["assets"] });
  };

  if (loading) return <div className="flex flex-1 items-center justify-center text-sm text-dm-text-3">加载中…</div>;
  if (!session) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <h1 className="font-dm-label text-xl text-dm-text">资产库</h1>
        <p className="max-w-sm text-center text-sm text-dm-text-3">登录后管理你上传与生成的全部素材。</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] flex-1 px-8 pt-10">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="font-dm-label text-xl font-semibold text-dm-text">资产库</h1>
        <div className="flex-1" />
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-dm-accent px-3 font-dm-label text-xs text-[#04252a] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Upload size={13} />
          {uploading ? "上传中…" : "上传素材"}
        </button>
      </div>
      {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

      <nav className="mb-5 flex items-center gap-1">
        {KINDS.map((k) => (
          <button
            key={k.key}
            onClick={() => setKind(k.key)}
            className={`rounded-lg px-3.5 py-2 font-dm-label text-xs transition-colors ${
              kind === k.key ? "bg-dm-surface-2 text-dm-text" : "text-dm-text-3 hover:text-dm-text-2"
            }`}
          >
            {k.label}
          </button>
        ))}
      </nav>

      {assets.isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-dm-surface" />
          ))}
        </div>
      ) : (assets.data ?? []).length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dm-border bg-dm-surface/50 text-sm text-dm-text-3">
          还没有素材 — 上传或生成后会出现在这里
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {(assets.data ?? []).map((a) => (
            <figure key={a.id} className="group relative aspect-square overflow-hidden rounded-xl bg-dm-surface">
              {a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.storageKey} className="h-full w-full object-cover" loading="lazy" />
              ) : a.kind === "video" ? (
                <video src={a.url} className="h-full w-full object-cover" muted playsInline />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-dm-text-4">{a.mime || a.kind}</div>
              )}
              <button
                aria-label={`删除 ${a.storageKey}`}
                onClick={() => void remove(a.id)}
                className="absolute right-2 top-2 hidden h-8 w-8 items-center justify-center rounded-lg bg-black/70 text-white group-hover:flex hover:bg-red-500/80"
              >
                <Trash2 size={14} />
              </button>
              <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 text-[10px] text-white/80">
                {a.kind} · {new Date(a.createdAt).toLocaleDateString("zh-CN")}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
