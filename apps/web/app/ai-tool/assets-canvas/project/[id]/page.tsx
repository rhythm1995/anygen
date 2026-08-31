"use client";

import { useParams } from "next/navigation";

import { useAuth } from "@/components/providers";
import { CanvasEditor } from "@/components/canvas/canvas-editor";

export default function ProjectCanvasPage() {
  const params = useParams<{ id: string }>();
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-sm text-dm-text-3">Loading…</div>;
  }
  if (!session) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <h1 className="font-dm-label text-xl text-dm-text">无限画布</h1>
        <p className="max-w-sm text-center text-sm text-dm-text-3">登录后在无限画布上与 Agent 一起创作。</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <CanvasEditor projectId={params.id} />
    </div>
  );
}
