"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Flame, Play, Sparkles, Upload } from "lucide-react";

import { Composer } from "@/components/shared/composer";
import { useAuth } from "@/components/providers";
import { api, type FeedItem, type FeedPage } from "@/lib/api";

function ModelCard({
  icon,
  title,
  subtitle,
  badge,
  corner,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  corner?: string;
}) {
  return (
    <button className="relative flex w-[240px] items-center gap-3 rounded-xl bg-dm-surface px-3 py-2.5 text-left transition-colors hover:bg-dm-surface-2">
      {corner && (
        <span className="absolute -top-2 right-2 rounded bg-dm-accent px-1.5 py-0.5 text-[9px] font-medium text-[#04252a]">
          {corner}
        </span>
      )}
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
      <img src={item.coverUrl} alt={item.title || "AI creation"} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
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
  { key: "trends", label: "Trends", icon: null },
  { key: "skills", label: "Skills", icon: <Flame size={13} /> },
  { key: "shorts", label: "AI Shorts", icon: null },
  { key: "events", label: "Events", icon: null },
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
          Start Creating With
          <button className="flex items-center gap-1 text-dm-accent">
            AI Agent
            <ChevronDown size={20} />
          </button>
        </h1>
        <div className="w-full max-w-[1000px]">
          <Composer onSubmit={() => router.push("/ai-tool/generate")} />
        </div>

        {/* Model cards */}
        <div className="mt-6 flex flex-wrap justify-center gap-3 pb-10">
          <ModelCard icon={<span className="text-[#4f8dff]">▶</span>} title="AI Video" subtitle="Seedance 2.5" badge="25" />
          <ModelCard icon={<span className="text-[#37d1e8]">✦</span>} title="AI Image" subtitle="Seedream 5.0" badge="5.0" />
          <ModelCard icon={<span>🏺</span>} title="Clay Renderer" subtitle="Plugin for Seedance 2.5" />
          <ModelCard icon={<Sparkles size={18} className="text-[#b9c6ff]" />} title="Smart edit ✨" subtitle="Upload your media" corner="New" />
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
          <span className="font-dm-label text-xs text-dm-text-3">Posted by me</span>
        </div>

        {!session ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dm-border bg-dm-surface/50 text-sm text-dm-text-3">
            Sign in to browse the community feed
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
