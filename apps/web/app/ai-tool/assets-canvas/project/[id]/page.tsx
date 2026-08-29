"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { api, type ProjectDetail } from "@/lib/api";

type DmNode = Node<Record<string, unknown>>;

function ImageNode({ data, selected }: NodeProps) {
  const d = data as { url?: string; label?: string };
  return (
    <div className={`overflow-hidden rounded-xl border bg-dm-surface ${selected ? "border-dm-accent" : "border-dm-border"}`}>
      {d.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={String(d.url)} alt={String(d.label ?? "node")} className="block max-w-[240px]" draggable={false} />
      ) : (
        <div className="flex h-32 w-48 items-center justify-center text-xs text-dm-text-4">no image</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-dm-accent" />
      <Handle type="target" position={Position.Left} className="!bg-dm-accent" />
    </div>
  );
}

function TextNode({ data, selected }: NodeProps) {
  const d = data as { text?: string };
  return (
    <div className={`w-48 rounded-xl border bg-dm-surface p-3 text-xs text-dm-text-2 ${selected ? "border-dm-accent" : "border-dm-border"}`}>
      {String(d.text ?? "") || "Double-click to edit…"}
      <Handle type="source" position={Position.Bottom} className="!bg-dm-accent" />
      <Handle type="target" position={Position.Top} className="!bg-dm-accent" />
    </div>
  );
}

const nodeTypes = { image: ImageNode, text: TextNode };

export default function ProjectCanvasPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState("New project");
  const [nameDirty, setNameDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const skipNextSync = useRef(true);

  const project = useQuery({
    queryKey: ["project", params.id],
    queryFn: () => api<ProjectDetail>(`/projects/${params.id}`),
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<DmNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  // 初始载入
  useEffect(() => {
    const p = project.data;
    if (!p) return;
    if (!nameDirty) setName(p.name);
    setNodes((p.graph?.nodes ?? []) as DmNode[]);
    setEdges((p.graph?.edges ?? []) as Edge[]);
    if (p.graph?.viewport) setViewport(p.graph.viewport);
    setTimeout(() => (skipNextSync.current = false), 100);
  }, [project.data]);

  // debounce 自动保存
  const save = useMutation({
    mutationFn: (payload: { name: string; graph: unknown }) =>
      api(`/projects/${params.id}`, { method: "PATCH", body: payload }),
    onSuccess: () => {
      setSaveState("saved");
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSave = useCallback(() => {
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaveState("saving");
      save.mutate({
        name,
        graph: {
          nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
          edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
          viewport,
        },
      });
    }, 800);
  }, [name, nodes, edges, viewport, save]);

  useEffect(() => {
    if (skipNextSync.current) return;
    scheduleSave();
  }, [nodes, edges, viewport, scheduleSave]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, id: `e-${c.source}-${c.target}-${Date.now()}` }, eds)),
    [setEdges],
  );

  const addImageFromSeed = () => {
    const seeds = [
      "7081168994673103362.jpg", "7102354325850034689.jpg", "7114563482518819329.jpg",
      "7114563483378651650.jpg", "7129448542808052225.jpg", "7130515992936976897.jpg",
    ];
    const url = `/seed/feed/${seeds[Math.floor(Math.random() * seeds.length)]}`;
    setNodes((nds) => [
      ...nds,
      {
        id: `n-${Date.now()}`,
        type: "image",
        position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
        data: { url, width: 640, height: 640, label: "seed image" },
      },
    ]);
  };

  const addText = () => {
    setNodes((nds) => [
      ...nds,
      {
        id: `t-${Date.now()}`,
        type: "text",
        position: { x: 120 + Math.random() * 300, y: 260 + Math.random() * 160 },
        data: { text: "新建便签" },
      },
    ]);
  };

  if (project.isLoading) {
    return <div className="flex flex-1 items-center justify-center text-sm text-dm-text-3">Loading canvas…</div>;
  }
  if (project.isError || !project.data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm text-dm-text-3">Project not found</p>
        <button onClick={() => router.push("/ai-tool/assets-canvas")} className="text-xs text-dm-accent">
          ← back to canvas
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      {/* 工具条 */}
      <header className="flex h-12 items-center gap-3 border-b border-dm-border px-4">
        <button onClick={() => router.push("/ai-tool/assets-canvas")} className="text-dm-text-3 hover:text-dm-text-2" aria-label="Back">
          <ArrowLeft size={16} />
        </button>
        <input
          value={name}
          onChange={(e) => {
            setNameDirty(true);
            setName(e.target.value);
            scheduleSave();
          }}
          className="w-64 bg-transparent text-sm text-dm-text outline-none placeholder:text-dm-text-4"
          aria-label="Project name"
        />
        <span className="text-[11px] text-dm-text-4">
          {saveState === "saved" ? "已保存" : saveState === "saving" ? "保存中…" : "未保存"}
        </span>
        <div className="flex-1" />
        <button onClick={addImageFromSeed} className="rounded-lg border border-dm-border px-3 py-1.5 font-dm-label text-xs text-dm-text-2 hover:bg-dm-surface">
          + 图片
        </button>
        <button onClick={addText} className="rounded-lg border border-dm-border px-3 py-1.5 font-dm-label text-xs text-dm-text-2 hover:bg-dm-surface">
          + 便签
        </button>
      </header>

      <div style={{ position: "relative", width: "100%", height: "calc(100vh - 48px)" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          defaultViewport={viewport}
          onMoveEnd={(_e, vp) => setViewport(vp)}
          fitView
          proOptions={{ hideAttribution: true }}
          className="bg-dm-bg"
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#26282e" />
          <Controls className="!border-dm-border !bg-dm-surface [&_button]:!bg-dm-surface [&_button]:!border-dm-border [&_button]:!fill-dm-text-2" />
          <MiniMap
            pannable
            className="!border-dm-border !bg-dm-surface"
            nodeColor="#22252a"
            maskColor="rgb(15 15 18 / 72%)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
