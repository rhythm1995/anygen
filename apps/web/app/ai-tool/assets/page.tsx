"use client";

/**
 * 资产库（D8 完整版，复刻 RECON/auth/asset/ 实测结构）：
 * 主 tab 生成历史/主体/画布 + 子 tab 图片/视频/音频/文档 + 筛选/时间/排序 + 搜索 + 批量操作。
 * 与原站差异：去掉「同步到剪映」（无此能力）；原位放「上传素材」保留平台上传入口。
 * 列表按天分组（今天/昨天/M月D日/往年带年份）；点击卡片开详情弹层。
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check, CheckSquare, ChevronDown, Download, FolderClosed, Search, Shapes, Square, Star, Trash2, Upload, X,
} from "lucide-react";

import { useAuth } from "@/components/providers";
import { AssetDetailDialog, type AssetDetailRow } from "@/components/shared/asset-detail-dialog";
import { api } from "@/lib/api";

type MainTab = "history" | "subject" | "canvas";
type KindFilter = "" | "image" | "video" | "audio" | "doc";
type TimePreset = "all" | "week" | "month" | "quarter" | "custom";

interface Filters {
  fav: boolean;
  hd: boolean;
  res: string[];
  ratio: string[];
  tags: string[];
  time: TimePreset;
  from: string;
  to: string;
  sort: "desc" | "asc";
}

const EMPTY_FILTERS: Filters = {
  fav: false, hd: false, res: [], ratio: [], tags: [], time: "all", from: "", to: "", sort: "desc",
};

const RES_OPTIONS = ["1K", "2K", "4K", "8K"];
const RATIO_OPTIONS = ["21:9", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"];
const TIME_OPTIONS: { key: TimePreset; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "week", label: "最近一周" },
  { key: "month", label: "最近一个月" },
  { key: "quarter", label: "最近三个月" },
];
const KIND_TABS: { key: KindFilter; label: string }[] = [
  { key: "image", label: "图片" },
  { key: "video", label: "视频" },
  { key: "audio", label: "音频" },
  { key: "doc", label: "文档" },
];

interface AssetRow extends AssetDetailRow {
  kind: string;
  storageKey: string;
  sizeBytes: number | null;
  published: boolean;
}

interface ProjectRow {
  id: string;
  name: string;
  thumbnail_url: string | null;
  updated_at: string;
}

export default function AssetsPage() {
  const { session, loading } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();

  const [mainTab, setMainTab] = useState<MainTab>("history");
  const [kind, setKind] = useState<KindFilter>("image");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [openPanel, setOpenPanel] = useState<"filter" | "time" | "sort" | "tags" | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2000);
    return () => clearTimeout(t);
  }, [notice]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (kind) p.set("kind", kind);
    if (filters.fav) p.set("fav", "1");
    if (filters.hd) p.set("hd", "1");
    if (filters.res.length) p.set("res", filters.res.join(","));
    if (filters.ratio.length) p.set("ratio", filters.ratio.join(","));
    if (filters.tags.length) p.set("tag", filters.tags.join(","));
    if (filters.sort === "asc") p.set("sort", "asc");
    const now = Date.now();
    const day = 86_400_000;
    if (filters.time === "week") p.set("from", new Date(now - 7 * day).toISOString());
    if (filters.time === "month") p.set("from", new Date(now - 30 * day).toISOString());
    if (filters.time === "quarter") p.set("from", new Date(now - 90 * day).toISOString());
    if (filters.time === "custom") {
      if (filters.from) p.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
      if (filters.to) p.set("to", new Date(`${filters.to}T23:59:59`).toISOString());
    }
    if (q.trim()) p.set("q", q.trim());
    return p.toString();
  }, [kind, filters, q]);

  const assets = useQuery({
    queryKey: ["assets", params],
    enabled: Boolean(session) && mainTab === "history",
    queryFn: () => api<AssetRow[]>(`/assets?${params}&limit=500`),
  });

  const projects = useQuery({
    queryKey: ["projects"],
    enabled: Boolean(session) && mainTab === "canvas",
    queryFn: () => api<ProjectRow[]>("/projects"),
  });

  // 用户全量标签（筛选面板「标签」分组；标签增删后失效重拉）
  const allTags = useQuery({
    queryKey: ["asset-tags"],
    enabled: Boolean(session),
    queryFn: () => api<{ tags: string[] }>("/assets/tags"),
  });

  const rows = assets.data ?? [];
  const filteredRows = useMemo(() => rows.filter((a) => a.kind !== "element"), [rows]);

  // 按天分组（列表已按 created_at 排序）
  const groups = useMemo(() => {
    const out: { label: string; items: AssetRow[] }[] = [];
    const keyOf = (iso: string) => new Date(iso).toDateString();
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86_400_000).toDateString();
    const thisYear = new Date().getFullYear();
    const dayLabel = (iso: string) => {
      const d = new Date(iso);
      const sameYear = d.getFullYear() === thisYear;
      return d.toLocaleDateString("zh-CN", sameYear
        ? { month: "long", day: "numeric" }
        : { year: "numeric", month: "long", day: "numeric" });
    };
    for (const item of filteredRows) {
      const key = keyOf(item.createdAt);
      const label =
        key === today ? "今天"
        : key === yesterday ? "昨天"
        : dayLabel(item.createdAt);
      const last = out.at(-1);
      if (last && keyOf(last.items[0]!.createdAt) === key) last.items.push(item);
      else out.push({ label, items: [item] });
    }
    return out;
  }, [filteredRows]);

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/assets/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["asset-tags"] });
    },
  });

  const batch = useMutation({
    mutationFn: (action: string) =>
      api("/assets/batch", { method: "POST", body: { action, ids: [...selected] } }),
    onSuccess: (_data, action) => {
      if (action === "delete") setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  const runBatch = (action: string) => {
    if (!selected.size) return;
    if (action === "download") {
      for (const row of rows.filter((a) => selected.has(a.id))) {
        const a = document.createElement("a");
        a.href = row.url;
        a.download = row.storageKey.split("/").pop() ?? "asset";
        a.target = "_blank";
        a.rel = "noopener";
        a.click();
      }
      return;
    }
    batch.mutate(action, {
      onSuccess: (_d, act) =>
        setNotice(act === "delete" ? `已删除 ${selected.size} 项` : act === "publish" ? "已发布" : "已更新"),
    });
  };

  // 上传（带尺寸/时长测量，ratio/res 筛选对上传资产即生效）
  const upload = async (file: File) => {
    setUploading(true);
    setNotice(null);
    try {
      const kindMap: Record<string, AssetRow["kind"]> = {
        "image/": "image", "video/": "video", "audio/": "audio", "application/pdf": "doc",
      };
      const assetKind = Object.entries(kindMap).find(([p]) => file.type.startsWith(p))?.[1] ?? "element";
      const meta: Record<string, unknown> = {};
      let width: number | undefined;
      let height: number | undefined;
      if (assetKind === "image") {
        const bmp = await createImageBitmap(file).catch(() => null);
        if (bmp) { width = bmp.width; height = bmp.height; }
      } else if (assetKind === "video") {
        const info = await videoMeta(file).catch(() => null);
        if (info) { width = info.width; height = info.height; meta.duration = info.duration; }
      }
      const presign = await api<{ url: string; key: string; publicUrl: string }>("/assets/presign", {
        method: "POST",
        body: { filename: file.name, contentType: file.type || "application/octet-stream", kind: assetKind },
      });
      const put = await fetch(presign.url, { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
      if (!put.ok) throw new Error(`直传失败 HTTP ${put.status}`);
      await api("/assets", {
        method: "POST",
        body: {
          key: presign.key, kind: assetKind, mime: file.type || "application/octet-stream",
          sizeBytes: file.size, width, height, meta,
        },
      });
      qc.invalidateQueries({ queryKey: ["assets"] });
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setUploading(false);
    }
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

  const filterActive = filters.fav || filters.hd || filters.res.length > 0 || filters.ratio.length > 0 || filters.tags.length > 0;
  const timeActive = filters.time !== "all";
  const toggleSel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 顶栏：主 tab + 右侧工具（批量模式整体替换） */}
      <header className="flex h-14 shrink-0 items-center gap-2 px-6">
        {batchMode ? (
          <>
            <span className="ml-2 text-sm text-dm-text-2">已选择 {selected.size} 项内容</span>
            <div className="flex-1" />
            <BatchBtn label="删除" icon={<Trash2 size={15} />} disabled={!selected.size} onClick={() => runBatch("delete")} />
            <BatchBtn label="下载" icon={<Download size={15} />} disabled={!selected.size} onClick={() => runBatch("download")} />
            <BatchBtn label="发布" icon={<Upload size={15} />} disabled={!selected.size} onClick={() => runBatch("publish")} />
            <BatchBtn label="收藏" icon={<CheckSquare size={15} />} disabled={!selected.size} onClick={() => runBatch("favorite")} />
            <span className="mx-2 h-4 w-px bg-dm-divider" />
            <button
              onClick={() => { setBatchMode(false); setSelected(new Set()); }}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-dm-text-2 hover:text-dm-text"
            >
              <X size={15} /> 取消选择
            </button>
          </>
        ) : (
          <>
            <MainTabBtn active={mainTab === "history"} onClick={() => setMainTab("history")} label="生成历史" />
            <MainTabBtn active={mainTab === "subject"} onClick={() => setMainTab("subject")} label="主体" />
            <MainTabBtn active={mainTab === "canvas"} onClick={() => setMainTab("canvas")} label="画布" />
            <div className="flex-1" />
            {searchOpen ? (
              <div className="flex h-9 items-center gap-2 rounded-lg bg-dm-surface-2 px-3">
                <Search size={15} className="text-dm-text-3" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); setSearchOpen(false); } }}
                  placeholder="搜索提示词 / 文件名"
                  className="w-56 bg-transparent text-sm text-dm-text outline-none placeholder:text-dm-text-4"
                />
                <button aria-label="关闭搜索" onClick={() => { setQ(""); setSearchOpen(false); }} className="text-dm-text-3 hover:text-dm-text-2">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button aria-label="搜索" onClick={() => setSearchOpen(true)} className="rounded-lg p-2 text-dm-text-2 hover:bg-dm-surface-2 hover:text-dm-text">
                <Search size={17} />
              </button>
            )}
            <span className="mx-1 h-4 w-px bg-dm-divider" />
            <button
              onClick={() => { setBatchMode(true); setSelected(new Set()); }}
              className="rounded-lg px-2 py-2 text-sm text-dm-text-2 hover:text-dm-text"
            >
              批量操作
            </button>
            <span className="mx-1 h-4 w-px bg-dm-divider" />
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-dm-text-2 hover:text-dm-text disabled:opacity-50"
            >
              <Upload size={15} />
              {uploading ? "上传中…" : "上传素材"}
            </button>
          </>
        )}
      </header>

      {/* 子 tab 行（仅生成历史） */}
      {mainTab === "history" && (
        <div className="flex h-11 shrink-0 items-center gap-1 px-6">
          {KIND_TABS.map((k) => (
            <button
              key={k.key}
              onClick={() => setKind(k.key)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                kind === k.key ? "text-dm-text" : "text-dm-text-3 hover:text-dm-text-2"
              }`}
            >
              {k.label}
            </button>
          ))}
          <span className="mx-3 h-4 w-px bg-dm-divider" />
          <FilterTrigger
            label="筛选" active={filterActive} open={openPanel === "filter"}
            onClick={() => setOpenPanel(openPanel === "filter" ? null : "filter")}
          >
            <FilterPanel filters={filters} setFilters={setFilters} onClose={() => setOpenPanel(null)} />
          </FilterTrigger>
          <FilterTrigger
            label="时间" active={timeActive} open={openPanel === "time"}
            onClick={() => setOpenPanel(openPanel === "time" ? null : "time")}
          >
            <TimePanel filters={filters} setFilters={setFilters} onClose={() => setOpenPanel(null)} />
          </FilterTrigger>
          <FilterTrigger
            label={filters.sort === "asc" ? "排序：远→近" : "排序"} active={filters.sort === "asc"} open={openPanel === "sort"}
            onClick={() => setOpenPanel(openPanel === "sort" ? null : "sort")}
          >
            <SortPanel filters={filters} setFilters={setFilters} onClose={() => setOpenPanel(null)} />
          </FilterTrigger>
          <FilterTrigger
            label={filters.tags.length ? `标签：${filters.tags[0]}${filters.tags.length > 1 ? `+${filters.tags.length - 1}` : ""}` : "标签"}
            active={filters.tags.length > 0} open={openPanel === "tags"}
            onClick={() => setOpenPanel(openPanel === "tags" ? null : "tags")}
          >
            <div className="w-56 py-2">
              {(allTags.data?.tags ?? []).length === 0 ? (
                <p className="px-5 py-3 text-xs text-dm-text-4">暂无标签 — 在详情弹层给资产添加</p>
              ) : (
                (allTags.data?.tags ?? []).map((t) => (
                  <CheckRow
                    key={t} label={t} checked={filters.tags.includes(t)}
                    onChange={() =>
                      setFilters({
                        ...filters,
                        tags: filters.tags.includes(t) ? filters.tags.filter((x) => x !== t) : [...filters.tags, t],
                      })
                    }
                  />
                ))
              )}
            </div>
          </FilterTrigger>
        </div>
      )}

      {notice && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-40 -translate-x-1/2 rounded-lg bg-dm-surface-2 px-4 py-2 text-sm text-dm-text shadow-lg">
          {notice}
        </div>
      )}

      {/* 内容区 */}
      <main className="min-h-0 flex-1 overflow-y-auto px-6 pb-10">
        {mainTab === "subject" && (
          <div className="flex h-64 items-center justify-center text-sm text-dm-text-3">暂无相关资产</div>
        )}

        {mainTab === "canvas" && (
          <div className="grid grid-cols-2 gap-4 pt-2 md:grid-cols-4 xl:grid-cols-6">
            {(projects.data ?? []).map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/ai-tool/assets-canvas/project/${p.id}`)}
                className="group overflow-hidden rounded-xl bg-dm-surface text-left transition-colors hover:bg-dm-surface-2"
              >
                <div className="flex aspect-video items-center justify-center bg-dm-surface-2">
                  {p.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnail_url} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <Shapes size={22} className="text-dm-text-4" />
                  )}
                </div>
                <div className="px-3 py-2">
                  <p className="truncate text-sm text-dm-text">{p.name}</p>
                  <p className="mt-0.5 text-xs text-dm-text-4">
                    {new Date(p.updated_at).toLocaleDateString("zh-CN")}
                  </p>
                </div>
              </button>
            ))}
            <button
              onClick={() => router.push("/ai-tool/assets-canvas")}
              className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border border-dm-border bg-dm-surface/50 text-dm-text-3 transition-colors hover:bg-dm-surface-2 hover:text-dm-text-2"
            >
              <FolderClosed size={20} />
              <span className="text-xs">管理画布</span>
            </button>
          </div>
        )}

        {mainTab === "history" && (
          assets.isLoading ? (
            <div className="grid grid-cols-2 gap-2 pt-2 md:grid-cols-4 xl:grid-cols-7">
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-xl bg-dm-surface" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="mt-2 flex h-64 items-center justify-center rounded-xl border border-dm-border bg-dm-surface/50 text-sm text-dm-text-3">
              暂无相关资产 — 上传或生成后会出现在这里
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.label + g.items[0]!.id} className="pt-4">
                <h2 className="py-2 text-2xl font-semibold text-dm-text">{g.label}</h2>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
                  {g.items.map((a) => (
                    <AssetCard
                      key={a.id}
                      asset={a}
                      batchMode={batchMode}
                      selected={selected.has(a.id)}
                      onToggle={() => toggleSel(a.id)}
                      onOpen={() => !batchMode && setDetailId(a.id)}
                    />
                  ))}
                </div>
              </section>
            ))
          )
        )}
      </main>

      {detailId && (
        <AssetDetailDialog
          assets={filteredRows}
          activeId={detailId}
          onActiveChange={setDetailId}
          onClose={() => setDetailId(null)}
          onToggleFavorite={(a) => patch.mutate({ id: a.id, body: { favorited: !a.favorited } })}
          onUpdateTags={(a, tags) => patch.mutate({ id: a.id, body: { tags } })}
        />
      )}
    </div>
  );
}

// ---------- 卡片 ----------

function AssetCard({
  asset, batchMode, selected, onToggle, onOpen,
}: {
  asset: AssetRow;
  batchMode: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <figure
      onClick={batchMode ? onToggle : onOpen}
      className="group relative aspect-[14/15] cursor-pointer overflow-hidden rounded-xl bg-dm-surface"
    >
      {asset.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.url} alt={asset.storageKey} className="h-full w-full object-cover" loading="lazy" />
      ) : asset.kind === "video" ? (
        <video src={asset.url} className="h-full w-full object-cover" muted playsInline />
      ) : (
        <div className="flex h-full items-center justify-center px-2 text-center text-xs text-dm-text-4">{asset.mime || asset.kind}</div>
      )}
      {asset.meta.taskId && !batchMode && (
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded border border-white/20 bg-black/40 px-1.5 py-0.5 text-[10px] text-white/90">
          AI生成
        </span>
      )}
      {(batchMode || selected) && (
        <button
          aria-label={selected ? "取消选择" : "选择"}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="absolute left-1.5 top-1.5 z-10 text-white"
        >
          {selected ? <CheckSquare size={18} className="text-dm-accent" /> : <Square size={18} className="drop-shadow" />}
        </button>
      )}
      {asset.favorited && !batchMode && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-black/40 p-1 text-dm-accent">
          <Star size={12} fill="currentColor" />
        </span>
      )}
    </figure>
  );
}

// ---------- 顶栏元素 ----------

function MainTabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm transition-colors ${
        active ? "bg-dm-surface-2 font-medium text-dm-text" : "text-dm-text-3 hover:text-dm-text-2"
      }`}
    >
      {label}
    </button>
  );
}

function BatchBtn({ label, icon, disabled, onClick }: { label: string; icon: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg bg-dm-surface-2 px-3.5 py-2 text-sm text-dm-text transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  );
}

// ---------- 下拉面板（受控浮层 + 点击外部关闭） ----------

function FilterTrigger({
  label, active, open, onClick, children,
}: {
  label: string;
  active: boolean;
  open: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        onClick={onClick}
        className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition-colors ${
          active || open ? "text-dm-accent" : "text-dm-text-3 hover:text-dm-text-2"
        }`}
      >
        {label}
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={onClick} aria-hidden />
          <div className="absolute left-0 top-full z-40 mt-2 rounded-xl border border-dm-border-2 bg-dm-raised shadow-2xl shadow-black/50">
            {children}
          </div>
        </>
      )}
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-3">
      <p className="text-xs text-dm-text-4">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function CheckRow({
  label, checked, onChange, trailing,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <button onClick={onChange} className="flex w-full items-center gap-2.5 rounded-lg py-2 text-left text-sm text-dm-text-2 hover:text-dm-text">
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
        checked ? "border-dm-accent bg-dm-accent" : "border-dm-divider"
      }`}>
        {checked && <Check size={11} strokeWidth={3} className="text-[#04252a]" />}
      </span>
      {label}
      {trailing}
    </button>
  );
}

function FilterPanel({
  filters, setFilters, onClose,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  onClose: () => void;
}) {
  return (
    <div className="max-h-[calc(100vh-180px)] w-60 overflow-y-auto divide-y divide-dm-border py-1">
      <PanelSection title="操作">
        <CheckRow label="收藏" checked={filters.fav} onChange={() => setFilters({ ...filters, fav: !filters.fav })} />
      </PanelSection>
      <PanelSection title="类型">
        <CheckRow label="超清" checked={filters.hd} onChange={() => setFilters({ ...filters, hd: !filters.hd })} />
      </PanelSection>
      <PanelSection title="分辨率">
        {RES_OPTIONS.map((r) => (
          <CheckRow
            key={r} label={r} checked={filters.res.includes(r)}
            onChange={() =>
              setFilters({
                ...filters,
                res: filters.res.includes(r) ? filters.res.filter((x) => x !== r) : [...filters.res, r],
              })
            }
          />
        ))}
      </PanelSection>
      <PanelSection title="比例">
        {RATIO_OPTIONS.map((r) => (
          <CheckRow
            key={r} label={r} checked={filters.ratio.includes(r)}
            onChange={() =>
              setFilters({
                ...filters,
                ratio: filters.ratio.includes(r) ? filters.ratio.filter((x) => x !== r) : [...filters.ratio, r],
              })
            }
          />
        ))}
      </PanelSection>
      <div className="px-5 py-3">
        <button
          onClick={() => { setFilters(EMPTY_FILTERS); onClose(); }}
          className="w-full rounded-lg bg-dm-surface-2 py-2 text-xs text-dm-text-2 hover:text-dm-text"
        >
          重置
        </button>
      </div>
    </div>
  );
}

function TimePanel({
  filters, setFilters, onClose,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  onClose: () => void;
}) {
  return (
    <div className="w-72 py-2">
      <div className="flex items-center gap-2 px-4 pb-2">
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, time: "custom", from: e.target.value })}
          className="h-8 flex-1 rounded-lg bg-dm-surface-2 px-2 text-xs text-dm-text outline-none [color-scheme:dark]"
          aria-label="开始日期"
        />
        <span className="text-xs text-dm-text-4">–</span>
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, time: "custom", to: e.target.value })}
          className="h-8 flex-1 rounded-lg bg-dm-surface-2 px-2 text-xs text-dm-text outline-none [color-scheme:dark]"
          aria-label="结束日期"
        />
      </div>
      {TIME_OPTIONS.map((o) => (
        <button
          key={o.key}
          onClick={() => { setFilters({ ...filters, time: o.key, from: "", to: "" }); onClose(); }}
          className="flex w-full items-center justify-between px-5 py-2.5 text-left text-sm text-dm-text-2 hover:text-dm-text"
        >
          {o.label}
          {filters.time === o.key && <span className="text-dm-accent">✓</span>}
        </button>
      ))}
    </div>
  );
}

function SortPanel({
  filters, setFilters, onClose,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  onClose: () => void;
}) {
  const opts = [
    { key: "desc" as const, label: "近→远" },
    { key: "asc" as const, label: "远→近" },
  ];
  return (
    <div className="w-44 py-2">
      <p className="px-5 pb-1 pt-2 text-xs text-dm-text-4">顺序</p>
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => { setFilters({ ...filters, sort: o.key }); onClose(); }}
          className="flex w-full items-center justify-between px-5 py-2.5 text-left text-sm text-dm-text-2 hover:text-dm-text"
        >
          {o.label}
          {filters.sort === o.key && <span className="text-dm-accent">✓</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- 工具 ----------

function videoMeta(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      const out = { width: v.videoWidth, height: v.videoHeight, duration: Math.round(v.duration) };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("video meta fail")); };
    v.src = url;
  });
}
