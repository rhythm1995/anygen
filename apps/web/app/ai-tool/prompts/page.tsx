"use client";
/**
 * 提示词中心（D12+）：左侧独立菜单页 /ai-tool/prompts。
 * UI 参照 vendor/infinite-canvas prompts 页（AGPL-3.0）shadcn 化：
 * 搜索/分类/标签筛选 + 卡片网格 + 详情弹层 + 复制/在画布中使用/去生成页。
 * 数据 = public/data/prompt-library.json（tools/fetch-prompts.mjs 从 7 个 GitHub 源导入，1593 条）。
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Lightbulb, Search, WandSparkles } from "lucide-react";

import { FullscreenPreview } from "@/components/shared/fullscreen-preview";

type Prompt = {
  id: string;
  title: string;
  coverUrl: string;
  prompt: string;
  tags: string[];
  category: string;
  preview?: string;
  githubUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

type Library = {
  fetchedAt: string;
  categories: Array<{ category: string; name: string; githubUrl: string; count: number }>;
  prompts: Prompt[];
};

const PAGE_SIZE = 24;

export default function PromptsPage() {
  const router = useRouter();
  const [titleInput, setTitleInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const library = useQuery({
    queryKey: ["prompt-library"],
    queryFn: async (): Promise<Library> => {
      const res = await fetch("/data/prompt-library.json");
      if (!res.ok) throw new Error(`提示词库加载失败 HTTP ${res.status}`);
      return res.json();
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    if (library.isError) toast.error(library.error instanceof Error ? library.error.message : "获取提示词失败");
  }, [library.isError, library.error]);

  useEffect(() => {
    setPage(1);
  }, [keyword, selectedTags, selectedCategory]);

  const categoryOptions = useMemo(
    () => [{ category: "all", name: "全部", count: library.data?.prompts.length ?? 0 }, ...(library.data?.categories ?? [])],
    [library.data],
  );
  const tagOptions = useMemo(() => {
    const counter = new Map<string, number>();
    for (const item of library.data?.prompts ?? []) {
      if (selectedCategory !== "all" && item.category !== selectedCategory) continue;
      for (const tag of item.tags ?? []) counter.set(tag, (counter.get(tag) ?? 0) + 1);
    }
    return [...counter.entries()].filter(([tag]) => tag !== "all").sort((a, b) => b[1] - a[1]).slice(0, 24).map(([tag]) => tag);
  }, [library.data, selectedCategory]);

  const filtered = useMemo(() => {
    const key = keyword.trim().toLowerCase();
    return (library.data?.prompts ?? []).filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false;
      if (selectedTags.length && !selectedTags.every((tag) => (item.tags ?? []).includes(tag))) return false;
      if (key && !`${item.title} ${item.prompt}`.toLowerCase().includes(key)) return false;
      return true;
    });
  }, [library.data, keyword, selectedCategory, selectedTags]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const selectedIndex = filtered.findIndex((item) => item.id === selectedId);
  const selected = selectedIndex >= 0 ? filtered[selectedIndex] : null;
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => toast.success("提示词已复制"));
  };
  const useInCanvas = (item: Prompt) => {
    sessionStorage.setItem("pending-canvas-prompt", item.prompt.slice(0, 4000));
    router.push("/ai-tool/assets-canvas");
  };
  const useInGenerate = (item: Prompt) => {
    sessionStorage.setItem("pending-prefill", JSON.stringify({ type: "image", prompt: item.prompt.slice(0, 4000) }));
    router.push("/ai-tool/generate?prefill=1");
  };

  const toggleTag = (tag: string) => setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <main
        className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-8"
        onScroll={(event) => {
          const target = event.currentTarget;
          if (visible.length < filtered.length && target.scrollTop + target.clientHeight >= target.scrollHeight - 200) setPage((current) => current + 1);
        }}
      >
        <div className="pb-8">
          <div className="mx-auto max-w-5xl text-center">
            <h1 className="flex items-center justify-center gap-2 text-2xl font-semibold tracking-tight text-dm-text">
              <Lightbulb className="size-6" />
              提示词中心
            </h1>
            <p className="mt-2 text-sm text-dm-text-3">共 {library.data?.prompts.length ?? 0} 条提示词（7 个开源仓库导入），按标题、标签与分类快速查找灵感。</p>
          </div>

          {library.isLoading ? (
            <div className="flex h-60 items-center justify-center text-sm text-dm-text-3">加载中…</div>
          ) : (
            <>
              <div className="mx-auto mt-6 w-full max-w-2xl">
                <div className="flex h-11 items-center gap-2 rounded-xl border border-dm-border bg-dm-surface px-3">
                  <Search className="size-4 shrink-0 text-dm-text-4" />
                  <input
                    value={titleInput}
                    onChange={(event) => setTitleInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setKeyword(titleInput);
                    }}
                    placeholder="按标题或内容查询，按 Enter 搜索"
                    className="h-full w-full bg-transparent text-sm text-dm-text outline-none placeholder:text-dm-text-4"
                  />
                </div>
              </div>

              <div className="mx-auto mt-6 grid max-w-4xl gap-3 text-left">
                <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                  <div className="pt-1.5 text-xs font-medium text-dm-text-3">分类</div>
                  <div className="flex flex-wrap gap-2">
                    {categoryOptions.map((category) => (
                      <button
                        key={category.category}
                        type="button"
                        onClick={() => setSelectedCategory(category.category)}
                        className={`h-7 rounded-full px-3 text-xs transition ${selectedCategory === category.category ? "bg-dm-accent text-white" : "bg-dm-surface text-dm-text-2 hover:text-dm-text"}`}
                      >
                        {category.name} {category.count ? `(${category.count})` : ""}
                      </button>
                    ))}
                  </div>
                </div>
                {tagOptions.length ? (
                  <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                    <div className="pt-1.5 text-xs font-medium text-dm-text-3">标签</div>
                    <div className="flex flex-wrap gap-2">
                      {tagOptions.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={`h-7 rounded-full px-3 text-xs transition ${selectedTags.includes(tag) ? "bg-dm-accent text-white" : "bg-dm-surface text-dm-text-2 hover:text-dm-text"}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>

        {!library.isLoading ? (
          <div>
            <div className="mx-auto grid max-w-7xl gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visible.map((item) => (
                <div key={item.id} className="overflow-hidden rounded-2xl border border-dm-border bg-dm-surface transition hover:border-dm-text-4">
                  <button type="button" className="block w-full text-left" onClick={() => setSelectedId(item.id)}>
                    {item.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.coverUrl} alt={item.title} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                    ) : (
                      <div className="grid aspect-[4/3] w-full place-items-center bg-dm-surface-2 text-dm-text-4">
                        <Lightbulb className="size-8 opacity-40" />
                      </div>
                    )}
                  </button>
                  <button type="button" className="block w-full text-left" onClick={() => setSelectedId(item.id)}>
                    <div className="p-4">
                      <h2 className="line-clamp-1 text-sm font-semibold text-dm-text">{item.title}</h2>
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-dm-text-3">{item.prompt}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(item.tags ?? []).slice(0, 4).map((tag) => (
                          <span key={tag} className="rounded-full bg-dm-surface-2 px-2 py-0.5 text-[11px] text-dm-text-2">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 px-4 pb-4">
                    <button type="button" className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-dm-border text-xs transition hover:bg-dm-surface-2" onClick={() => copy(item.prompt)}>
                      <Copy className="size-3.5" /> 复制
                    </button>
                    <button type="button" className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#2f80ff] text-xs font-medium text-white transition hover:opacity-90" onClick={() => useInCanvas(item)}>
                      <WandSparkles className="size-3.5" /> 在画布中使用
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {!filtered.length ? <div className="py-16 text-center text-sm text-dm-text-3">没有找到匹配的提示词</div> : null}
            <div className="mx-auto mt-6 max-w-7xl text-center text-xs text-dm-text-4">
              {visible.length < filtered.length ? (
                <button type="button" className="rounded-full border border-dm-border px-4 py-1.5 transition hover:bg-dm-surface" onClick={() => setPage((current) => current + 1)}>
                  已展示 {visible.length} / {filtered.length} 条 · 加载更多
                </button>
              ) : filtered.length ? "已经到底了" : null}
            </div>
          </div>
        ) : null}
      </main>

      <FullscreenPreview
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        index={selectedIndex}
        total={filtered.length}
        onStep={(delta) => {
          if (!filtered.length) return;
          const next = (selectedIndex + delta + filtered.length) % filtered.length;
          setSelectedId(filtered[next]!.id);
        }}
        ariaLabel="提示词详情"
        media={
          selected?.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.coverUrl} alt={selected.title} className="max-h-full max-w-full rounded-lg object-contain" />
          ) : (
            <div className="flex h-40 items-center text-sm text-dm-text-3">无预览图</div>
          )
        }
      >
        {selected ? (
          <>
            <h2 className="text-lg font-semibold leading-7 text-dm-text">{selected.title}</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(selected.tags ?? []).map((tag) => (
                <span key={tag} className="rounded-full bg-dm-surface-2 px-2 py-0.5 text-[11px] text-dm-text-2">
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-5 text-xs font-medium text-dm-text-3">提示词</div>
            <pre className="thin-scrollbar mt-2 max-h-[38vh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-dm-surface p-4 text-sm leading-6 text-dm-text-2">{selected.prompt}</pre>
            {selected.githubUrl ? (
              <a href={selected.githubUrl} target="_blank" rel="noreferrer" className="mt-4 block truncate text-xs text-dm-accent underline">
                来源：{selected.githubUrl}
              </a>
            ) : null}
            <div className="mt-6 flex flex-col gap-2">
              <button type="button" className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#2f80ff] text-sm font-medium text-white transition hover:opacity-90" onClick={() => copy(selected.prompt)}>
                <Copy className="size-4" /> 复制提示词
              </button>
              <button type="button" className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dm-border text-sm transition hover:bg-dm-surface" onClick={() => useInCanvas(selected)}>
                <WandSparkles className="size-4" /> 在画布中使用
              </button>
              <button type="button" className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dm-border text-sm transition hover:bg-dm-surface" onClick={() => useInGenerate(selected)}>
                去生成页使用
              </button>
            </div>
          </>
        ) : null}
      </FullscreenPreview>
    </div>
  );
}
