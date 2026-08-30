"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";

import { CreationComposer } from "@/components/shared/creation-composer";
import { useAuth } from "@/components/providers";
import { api, type Project } from "@/lib/api";

const IDEA_SEEDS = [
  "7081168994673103362.jpg",
  "7102354325850034689.jpg",
  "7114563482518819329.jpg",
  "7114563483378651650.jpg",
  "7129448542808052225.jpg",
  "7130515992936976897.jpg",
];
const IDEAS = [
  "Urban Coffee Visual Identity",
  "Art Toy Character Design",
  "Stellar Odyssey Storyboard",
  "Perfume Collection Poster",
  "Healing Illustrated Storybook",
  "Surreal Dreamscape Storyboard",
].map((title, i) => ({ title, seed: IDEA_SEEDS[i] }));

function IdeaCards() {
  const qc = useQueryClient();
  const router = useRouter();
  const create = useMutation({
    mutationFn: (name: string) => api<Project>("/projects", { method: "POST", body: { name } }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      router.push(`/ai-tool/assets-canvas/project/${p.id}`);
    },
  });

  return (
    <section className="mt-14 w-full">
      <h2 className="mb-4 text-base text-dm-text-2">Start with these ideas</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {IDEAS.map((idea) => (
          <button
            key={idea.title}
            onClick={() => create.mutate(idea.title)}
            className="group relative h-[96px] overflow-hidden rounded-xl bg-dm-surface text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/seed/feed/${idea.seed}`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/85 to-transparent px-3 pb-2.5 pt-6 text-xs font-medium text-white">
              {idea.title}
              <ArrowRight size={12} className="opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProjectList() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/projects"),
  });
  const create = useMutation({
    mutationFn: () => api<Project>("/projects", { method: "POST", body: {} }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      router.push(`/ai-tool/assets-canvas/project/${p.id}`);
    },
  });

  return (
    <section className="mb-16 mt-14 w-full">
      <h2 className="mb-4 text-base text-dm-text-2">Recent projects</h2>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => create.mutate()}
          className="flex h-[140px] w-[240px] flex-col items-center justify-center rounded-xl bg-dm-surface transition-colors hover:bg-dm-surface-2"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-dm-surface-2 text-dm-text-2">
            <Plus size={18} />
          </span>
          <span className="mt-2 text-xs text-dm-text-3">新建项目</span>
        </button>
        {isLoading
          ? null
          : (projects ?? []).map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/ai-tool/assets-canvas/project/${p.id}`)}
                className="flex h-[140px] w-[240px] flex-col overflow-hidden rounded-xl bg-dm-surface text-left transition-colors hover:bg-dm-surface-2"
              >
                <span className="flex flex-1 items-center justify-center text-dm-text-4">
                  <Shapes placeholder="canvas" />
                </span>
                <span className="truncate px-3 pb-2.5 text-xs text-dm-text-3">{p.name}</span>
              </button>
            ))}
      </div>
    </section>
  );
}

function Shapes({ placeholder }: { placeholder?: string }) {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-label={placeholder}>
      <rect x="4" y="4" width="18" height="18" rx="3" stroke="#3a3f47" strokeWidth="1.5" />
      <circle cx="27" cy="27" r="9" stroke="#3a3f47" strokeWidth="1.5" />
    </svg>
  );
}

export default function CanvasEntryPage() {
  const { session, loading } = useAuth();
  const router = useRouter();

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-sm text-dm-text-3">Loading…</div>;
  }

  if (!session) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <h1 className="font-dm-label text-xl text-dm-text">资产与画布</h1>
        <p className="max-w-sm text-center text-sm text-dm-text-3">
          登录后管理你的创作资产与无限画布项目。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col items-center px-8 pt-16">
      <h1 className="mb-8 font-dm-label text-[26px] font-semibold text-dm-text">今天想创作点什么？</h1>
      <div className="w-full max-w-[780px]">
        <CreationComposer
            compact
            placeholder="从想法开始，@ 引用元素"
            onSubmit={(payload) => {
              sessionStorage.setItem("pending-generation", JSON.stringify(payload));
              router.push("/ai-tool/generate?auto=1");
            }}
          />
      </div>
      <div className="w-full">
        <IdeaCards />
        <ProjectList />
      </div>
    </div>
  );
}
