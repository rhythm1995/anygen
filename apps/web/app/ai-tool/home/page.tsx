"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Flame, Play, Upload } from "lucide-react";

import { CreationComposer, type AgentSubmitPayload } from "@/components/shared/creation-composer";
import { useAuth } from "@/components/providers";
import { api, type FeedItem, type FeedPage } from "@/lib/api";

function ModelCard({
  icon,
  title,
  subtitle,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex w-[240px] items-center gap-3 rounded-xl bg-dm-surface px-3 py-2.5 text-left transition-colors hover:bg-dm-surface-2"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-dm-surface-2 text-lg">{icon}</span>
      <span className="flex flex-col">
        <span className="text-sm text-dm-text">{title}</span>
        <span className="text-xs text-dm-text-3">{subtitle}</span>
      </span>
      {badge && (
        <span className="absolute -left-1 top-1/2 -translate-y-1/2 rounded bg-[#2f7bff] px-1 py-0.5 text-[9px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

function FeedCard({ item }: { item: FeedItem }) {
  return (
    <figure className="group relative mb-3 break-inside-avoid overflow-hidden rounded-xl bg-dm-surface" style={{ aspectRatio: `${item.width} / ${item.height || 1}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.coverUrl} alt={item.title || "AI 创作"} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/80 to-transparent p-3 text-xs text-white opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        {item.generateType === "text2video" && (
          <span className="mr-1 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px]">
            <Play size={8} /> Video
          </span>
        )}
        {item.title || `@${item.authorName || "creator"}`}
      </figcaption>
    </figure>
  );
}

const TABS = [
  { key: "trends", label: "发现", icon: null },
  { key: "skills", label: "技能", icon: <Flame size={13} /> },
  { key: "shorts", label: "AI 短片", icon: null },
  { key: "events", label: "活动", icon: null },
];

export default function HomePage() {
  const router = useRouter();
  const { session } = useAuth();
  const [tab, setTab] = useState("trends");

  const query = useInfiniteQuery({
    queryKey: ["feed"],
    enabled: Boolean(session),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<FeedPage>(`/feed?offset=${pageParam}`),
    getNextPageParam: (last) => (last.hasMore ? last.nextOffset : undefined),
  });

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [query]);

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center px-6 pt-16">
        <h1 className="mb-6 flex items-center gap-2 text-center font-dm-label text-[28px] font-bold text-dm-text">
          开始创作，交给
          <button className="flex items-center gap-1 text-dm-accent">
            AI Agent
            <ChevronDown size={20} />
          </button>
        </h1>
        <div className="w-full max-w-[1000px]">
          <CreationComposer
            onSubmit={(payload: AgentSubmitPayload) => {
              sessionStorage.setItem("pending-generation", JSON.stringify(payload));
              router.push("/ai-tool/generate?auto=1");
            }}
          />
        </div>

        {/* Model cards（D11：只留 AI 视频/AI 图片，点击联动生成页创作类型；黏土渲染/智能编辑暂隐藏） */}
        <div className="mt-6 flex flex-wrap justify-center gap-3 pb-10">
          {(
            [
              { icon: <span className="text-[#4f8dff]">▶</span>, title: "AI 视频", subtitle: "Seedance 2.5", badge: "25", type: "video" },
              { icon: <span className="text-[#37d1e8]">✦</span>, title: "AI 图片", subtitle: "Seedream 5.0", badge: "5.0", type: "image" },
            ] as const
          ).map((c) => (
            <ModelCard
              key={c.title}
              icon={c.icon}
              title={c.title}
              subtitle={c.subtitle}
              badge={c.badge}
              onClick={() => {
                sessionStorage.setItem("pending-prefill", JSON.stringify({ type: c.type, prompt: "", params: {} }));
                router.push("/ai-tool/generate?prefill=1");
              }}
            />
          ))}
        </div>
      </section>

      {/* Feed */}
      <section className="mx-auto w-full max-w-[1280px] flex-1 px-8">
        <div className="flex items-center justify-between pb-4">
          <nav className="flex items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 font-dm-label text-xs transition-colors ${
                  tab === t.key ? "bg-dm-surface-2 text-dm-text" : "text-dm-text-3 hover:text-dm-text-2"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
          <span className="font-dm-label text-xs text-dm-text-3">我的发布</span>
        </div>

        {!session ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dm-border bg-dm-surface/50 text-sm text-dm-text-3">
            登录后浏览灵感社区
          </div>
        ) : query.isLoading ? (
          <div className="columns-2 gap-3 md:columns-3 xl:columns-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="mb-3 break-inside-avoid animate-pulse rounded-xl bg-dm-surface" style={{ height: 180 + (i % 4) * 60 }} />
            ))}
          </div>
        ) : (
          <div className="columns-2 gap-3 md:columns-3 xl:columns-5">
            {items.map((item) => (
              <FeedCard key={item.id} item={item} />
            ))}
          </div>
        )}
        <div ref={sentinel} className="h-8" />
      </section>
    </div>
  );
}
