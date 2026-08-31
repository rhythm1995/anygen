"use client";
/**
 * 画布编辑器 Phase A 编排器（D12）
 * 交互骨架移植自 vendor/infinite-canvas canvas-client-page.tsx（tigerowo，AGPL-3.0）；
 * 存储/加载替换为本项目 /api/projects（服务端唯一真源，无 local-first 同步）。
 * Phase B 接生成面板、Phase C 接对话侧栏、Phase D 接全景图/导演台（renderPanel/renderNodeContent 扩展点）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, MessageSquare, Upload, FolderOpen } from "lucide-react";

import { api, type AssetRow, type CreationTypesConfig, type GenTask, type ProjectDetail } from "@/lib/api";
import { normalizeLegacyGraphNode } from "@dreamina/shared";
import { canvasThemes } from "@/lib/canvas-theme";
import { defaultModelFor, modelsFor, pollCanvasTask, submitCanvasTask } from "@/lib/canvas/generation";
import { useThemeStore } from "./theme-store";
import { getNodeSpec } from "./constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type ContextMenuState, type Position, type SelectionBox, type ViewportTransform } from "./types";
import { findGroupDropTarget, snapNodesIntoGroup } from "./utils/canvas-group";
import { isCanvasImageNodeType } from "./utils/canvas-panorama";
import { uploadLocalImage, uploadImageFile, imageMetadata } from "./utils/canvas-image-data";
import { InfiniteCanvas } from "./components/infinite-canvas";
import { CanvasNode } from "./components/canvas-node";
import { ConnectionPath, ActiveConnectionPath } from "./components/canvas-connections";
import { Minimap } from "./components/canvas-mini-map";
import { CanvasZoomControls } from "./components/canvas-zoom-controls";
import { CanvasToolbar } from "./components/canvas-toolbar";
import { CanvasNodeContextMenu } from "./components/canvas-context-menu";
import { ConfigNodePanel } from "./components/config-node-panel";
import { CanvasAssistantPanel, type AssistantBridge } from "./components/canvas-assistant-panel";
import { createAgentExecutor } from "./agent-executor";
import type { CanvasAssistantSession } from "./types";

const MAX_HISTORY = 60;

type HistoryEntry = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    viewport: ViewportTransform;
    backgroundMode: "dots" | "lines" | "blank";
};

type CanvasMenuState = { x: number; y: number; world: Position } | null;

function uid(prefix: string) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createCanvasNode(type: CanvasNodeType, position: Position, title?: string): CanvasNodeData {
    const spec = getNodeSpec(type);
    return {
        id: uid(type),
        type,
        title: title || spec.title,
        position,
        width: spec.width,
        height: spec.height,
        metadata: { ...spec.metadata },
    };
}

/** API graph（shared 契约）→ 编辑器模型 */
function graphToEditor(detail: ProjectDetail) {
    const graph = detail.graph ?? { nodes: [], edges: [] as { id: string; source: string; target: string }[] };
    const nodes: CanvasNodeData[] = (graph.nodes ?? []).map((raw) => {
        const normalized = normalizeLegacyGraphNode(raw);
        const type = (Object.values(CanvasNodeType) as string[]).includes(normalized.type) ? (normalized.type as CanvasNodeType) : CanvasNodeType.Text;
        const spec = getNodeSpec(type);
        const data = (normalized.data ?? {}) as Record<string, unknown>;
        return {
            id: normalized.id,
            type,
            title: typeof data.title === "string" ? data.title : spec.title,
            position: normalized.position,
            width: typeof raw.width === "number" && raw.width > 0 ? raw.width : spec.width,
            height: typeof raw.height === "number" && raw.height > 0 ? raw.height : spec.height,
            metadata: data as CanvasNodeData["metadata"],
        };
    });
    const connections: CanvasConnection[] = (graph.edges ?? []).map((edge) => ({ id: edge.id, fromNodeId: edge.source, toNodeId: edge.target }));
    const viewport: ViewportTransform = graph.viewport ? { x: graph.viewport.x, y: graph.viewport.y, k: graph.viewport.zoom ?? 1 } : { x: 0, y: 0, k: 1 };
    const backgroundMode = (["dots", "lines", "blank"] as const).includes((graph as { backgroundMode?: string }).backgroundMode as never) ? ((graph as { backgroundMode?: "dots" | "lines" | "blank" }).backgroundMode as "dots" | "lines" | "blank") : "lines";
    const chatSessions = Array.isArray((graph as { chatSessions?: unknown }).chatSessions) ? ((graph as { chatSessions?: CanvasAssistantSession[] }).chatSessions ?? []) : [];
    const activeChatId = typeof (graph as { activeChatId?: unknown }).activeChatId === "string" ? (graph as { activeChatId?: string }).activeChatId : null;
    return { nodes, connections, viewport, backgroundMode, name: detail.name, chatSessions, activeChatId };
}

export function CanvasEditor({ projectId }: { projectId: string }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const qc = useQueryClient();
    const containerRef = useRef<HTMLDivElement>(null);

    const project = useQuery({
        queryKey: ["project", projectId],
        queryFn: () => api<ProjectDetail>(`/projects/${projectId}`),
    });

    // 模型清单（admin models 表驱动，D4：禁前端硬编码）
    const creationConfig = useQuery({
        queryKey: ["creation-config"],
        queryFn: () => import("@/lib/canvas/generation").then((m) => m.fetchCreationConfig()),
        staleTime: 5 * 60_000,
    });

    // ---- 编辑器状态 ----
    const [name, setName] = useState("未命名项目");
    const [nameDirty, setNameDirty] = useState(false);
    const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
    const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [backgroundMode, setBackgroundMode] = useState<"dots" | "lines" | "blank">("lines");
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [canvasTool, setCanvasTool] = useState<"select" | "pan">("select");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [focusedConnectionId, setFocusedConnectionId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [connecting, setConnecting] = useState<{ handle: { nodeId: string; handleType: "source" | "target" }; mouseWorld: Position } | null>(null);
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [canvasMenu, setCanvasMenu] = useState<CanvasMenuState>(null);
    const [minimapOpen, setMinimapOpen] = useState(true);
    const [clipboard, setClipboard] = useState<CanvasNodeData[]>([]);
    const [runningNodeTasks, setRunningNodeTasks] = useState<Record<string, string>>({});
    const [assistantOpen, setAssistantOpen] = useState(false);
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);

    // Agent 桥接 refs（跨模型步骤读取实时画布）
    const nodesRef = useRef<CanvasNodeData[]>([]);
    const connectionsRef = useRef<CanvasConnection[]>([]);
    const selectedIdsRef = useRef<string[]>([]);
    const creationConfigRef = useRef<CreationTypesConfig | undefined>(undefined);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { connectionsRef.current = connections; }, [connections]);
    useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
    useEffect(() => { creationConfigRef.current = creationConfig.data; }, [creationConfig.data]);
    const [createMenuOpen, setCreateMenuOpen] = useState(false);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const skipNextHistory = useRef(true);
    const lastSavedJson = useRef<string | null>(null);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
    const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
    const dragState = useRef<{ movedIds: string[]; startWorld: Position; origins: Map<string, Position>; moved: boolean } | null>(null);
    const connectState = useRef<{ handle: { nodeId: string; handleType: "source" | "target" } } | null>(null);
    const selectionState = useRef<SelectionBox | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ---- 初始载入 ----
    useEffect(() => {
        if (!project.data) return;
        const loaded = graphToEditor(project.data);
        if (!nameDirty) setName(loaded.name);
        setNodes(loaded.nodes);
        setConnections(loaded.connections);
        setViewport(loaded.viewport);
        setBackgroundMode(loaded.backgroundMode);
        setChatSessions(loaded.chatSessions);
        setActiveChatId(loaded.activeChatId ?? null);
        lastSavedJson.current = JSON.stringify(serializeGraph(loaded.nodes, loaded.connections, loaded.viewport, loaded.backgroundMode, nameDirty ? name : loaded.name));
        setTimeout(() => (skipNextHistory.current = false), 120);
    }, [project.data]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => setViewportSize({ width: el.clientWidth, height: el.clientHeight }));
        observer.observe(el);
        setViewportSize({ width: el.clientWidth, height: el.clientHeight });
        return () => observer.disconnect();
    }, []);

    // ---- 序列化/自动保存 ----
    function serializeGraph(nextNodes: CanvasNodeData[], nextConnections: CanvasConnection[], nextViewport: ViewportTransform, nextBackgroundMode: string, nextName: string) {
        return {
            name: nextName,
            graph: {
                nodes: nextNodes
                    .filter((node) => node.type !== CanvasNodeType.Group || Boolean(node.metadata?.groupId === undefined))
                    .map((node) => ({
                        id: node.id,
                        type: node.type,
                        position: node.position,
                        width: node.width,
                        height: node.height,
                        data: { ...node.metadata, title: node.title },
                    })),
                edges: nextConnections.map((connection) => ({ id: connection.id, source: connection.fromNodeId, target: connection.toNodeId })),
                viewport: { x: nextViewport.x, y: nextViewport.y, zoom: Math.min(Math.max(nextViewport.k, 0.05), 5) },
                backgroundMode: nextBackgroundMode,
                showImageInfo,
                ...(chatSessions.length ? { chatSessions } : {}),
                ...(activeChatId ? { activeChatId } : {}),
            },
        };
    }

    const save = useMutation({
        mutationFn: (payload: unknown) => api(`/projects/${projectId}`, { method: "PATCH", body: payload }),
        onSuccess: () => {
            setSaveState("saved");
            qc.invalidateQueries({ queryKey: ["projects"] });
        },
        onError: (e: Error) => toast.error(`保存失败：${e.message}`),
    });

    const scheduleSave = useCallback(() => {
        const payload = serializeGraph(nodes, connections, viewport, backgroundMode, name);
        const serialized = JSON.stringify(payload);
        if (serialized === lastSavedJson.current) return;
        setSaveState("dirty");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            setSaveState("saving");
            lastSavedJson.current = serialized;
            save.mutate(payload);
        }, 800);
    }, [nodes, connections, viewport, backgroundMode, name, save, showImageInfo, chatSessions, activeChatId]);

    useEffect(() => {
        if (skipNextHistory.current) return;
        scheduleSave();
    }, [nodes, connections, viewport, backgroundMode, showImageInfo, chatSessions, activeChatId, scheduleSave]);

    // ---- 历史栈 ----
    const pushHistory = useCallback((entry?: HistoryEntry) => {
        if (skipNextHistory.current) return;
        setUndoStack((stack) => [...stack.slice(-MAX_HISTORY), entry ?? { nodes, connections, viewport, backgroundMode }]);
        setRedoStack([]);
    }, [nodes, connections, viewport, backgroundMode]);

    const applyHistory = useCallback((entry: HistoryEntry) => {
        setNodes(entry.nodes);
        setConnections(entry.connections);
        setViewport(entry.viewport);
        setBackgroundMode(entry.backgroundMode);
    }, []);

    const undoCanvas = useCallback(() => {
        setUndoStack((stack) => {
            if (!stack.length) return stack;
            const previous = stack[stack.length - 1];
            setRedoStack((redo) => [...redo, { nodes, connections, viewport, backgroundMode }]);
            applyHistory(previous);
            return stack.slice(0, -1);
        });
    }, [nodes, connections, viewport, backgroundMode, applyHistory]);

    const redoCanvas = useCallback(() => {
        setRedoStack((stack) => {
            if (!stack.length) return stack;
            const next = stack[stack.length - 1];
            setUndoStack((undo) => [...undo, { nodes, connections, viewport, backgroundMode }]);
            applyHistory(next);
            return stack.slice(0, -1);
        });
    }, [nodes, connections, viewport, backgroundMode, applyHistory]);

    // ---- 坐标换算 ----
    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return { x: (clientX - rect.left - viewport.x) / viewport.k, y: (clientY - rect.top - viewport.y) / viewport.k };
    }, [viewport]);

    const getCanvasCenter = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return { x: (rect.width / 2 - viewport.x) / viewport.k, y: (rect.height / 2 - viewport.y) / viewport.k };
    }, [viewport]);

    // ---- 节点操作 ----
    const createNode = useCallback((type: CanvasNodeType, position: Position, title?: string) => {
        pushHistory();
        setNodes((current) => [...current, createCanvasNode(type, position, title)]);
        setCreateMenuOpen(false);
        setCanvasMenu(null);
    }, [pushHistory]);

    const deleteNodes = useCallback((ids: string[]) => {
        if (!ids.length) return;
        pushHistory();
        const idSet = new Set(ids);
        const children = nodes.filter((node) => node.metadata?.batchRootId && idSet.has(node.metadata.batchRootId)).map((node) => node.id);
        const allIds = new Set([...ids, ...children]);
        setNodes((current) => current.filter((node) => !allIds.has(node.id)));
        setConnections((current) => current.filter((connection) => !allIds.has(connection.fromNodeId) && !allIds.has(connection.toNodeId)));
        setSelectedIds([]);
    }, [nodes, pushHistory]);

    const deleteConnection = useCallback((connectionId: string) => {
        pushHistory();
        setConnections((current) => current.filter((connection) => connection.id !== connectionId));
        setFocusedConnectionId(null);
        setContextMenu(null);
    }, [pushHistory]);

    const duplicateNode = useCallback((nodeId: string) => {
        const node = nodes.find((item) => item.id === nodeId);
        if (!node) return;
        pushHistory();
        const copy: CanvasNodeData = { ...node, id: uid(node.type), position: { x: node.position.x + 40, y: node.position.y + 40 }, metadata: { ...node.metadata } };
        setNodes((current) => [...current, copy]);
        setContextMenu(null);
    }, [nodes, pushHistory]);

    const createGroupFromSelection = useCallback(() => {
        if (selectedIds.length < 2) return;
        const selected = nodes.filter((node) => selectedIds.includes(node.id));
        if (!selected.length) return;
        pushHistory();
        const left = Math.min(...selected.map((node) => node.position.x));
        const top = Math.min(...selected.map((node) => node.position.y));
        const right = Math.max(...selected.map((node) => node.position.x + node.width));
        const bottom = Math.max(...selected.map((node) => node.position.y + node.height));
        const group = createCanvasNode(CanvasNodeType.Group, { x: left - 24, y: top - 24 });
        group.width = right - left + 48;
        group.height = bottom - top + 48;
        setNodes((current) => [
            ...current,
            { ...group, metadata: { status: "idle" } },
        ]);
    }, [nodes, selectedIds, pushHistory]);

    const copySelectedNodes = useCallback(() => {
        const selected = nodes.filter((node) => selectedIds.includes(node.id) && node.type !== CanvasNodeType.Group);
        if (!selected.length) return;
        setClipboard(selected.map((node) => ({ ...node, metadata: { ...node.metadata } })));
        toast.success(`已复制 ${selected.length} 个节点`);
    }, [nodes, selectedIds]);

    const pasteCopiedNodes = useCallback(() => {
        if (!clipboard.length) return;
        pushHistory();
        const pasted = clipboard.map((node) => ({
            ...node,
            id: uid(node.type),
            position: { x: node.position.x + 60, y: node.position.y + 60 },
            metadata: { ...node.metadata, batchRootId: undefined, isBatchRoot: undefined },
        }));
        setNodes((current) => [...current, ...pasted]);
        setSelectedIds(pasted.map((node) => node.id));
    }, [clipboard, pushHistory]);

    const clearCanvas = useCallback(() => {
        if (!nodes.length) return;
        pushHistory();
        setNodes([]);
        setConnections([]);
        setSelectedIds([]);
    }, [nodes, connections, pushHistory]);

    // ---- 选中相关集合 ----
    const relatedIds = useMemo(() => {
        if (!selectedIds.length && !focusedConnectionId) return new Set<string>();
        const ids = new Set<string>();
        for (const connection of connections) {
            if (selectedIds.includes(connection.fromNodeId) || selectedIds.includes(connection.toNodeId) || focusedConnectionId === connection.id) {
                ids.add(connection.fromNodeId);
                ids.add(connection.toNodeId);
            }
        }
        return ids;
    }, [connections, selectedIds, focusedConnectionId]);

    // ---- 生成闭环（Phase B：一律走 /generation/tasks 计费管线） ----
    const upstreamInputsOf = useCallback((configNodeId: string) => {
        const upstream = connections
            .filter((connection) => connection.toNodeId === configNodeId)
            .map((connection) => nodes.find((node) => node.id === connection.fromNodeId))
            .filter((node): node is CanvasNodeData => Boolean(node));
        const ordered = (() => {
            const config = nodes.find((node) => node.id === configNodeId);
            const order = config?.metadata?.inputOrder;
            if (!order?.length) return upstream;
            return [...upstream].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        })();
        return {
            textNodes: ordered.filter((node) => node.type === CanvasNodeType.Text && (node.metadata?.content || node.metadata?.prompt)),
            imageNodes: ordered.filter((node) => isCanvasImageNodeType(node.type) && node.metadata?.content),
            videoNodes: ordered.filter((node) => node.type === CanvasNodeType.Video && node.metadata?.content),
            audioNodes: ordered.filter((node) => node.type === CanvasNodeType.Audio && node.metadata?.content),
        };
    }, [connections, nodes]);

    const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeMetadata>) => {
        setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...patch } } : node)));
    }, []);

    const markNodeError = useCallback((nodeId: string, message: string) => {
        setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: "error", errorDetails: message } } : node)));
        setRunningNodeTasks((current) => {
            if (!(nodeId in current)) return current;
            const next = { ...current };
            delete next[nodeId];
            return next;
        });
    }, []);

    const finalizeTask = useCallback(async (nodeId: string, task: GenTask) => {
        const target = nodes.find((node) => node.id === nodeId);
        if (!target) return;
        let urls: string[] = [];
        let assets: AssetRow[] = [];
        if (task.outputs?.length) {
            assets = await api<AssetRow[]>("/assets").catch(() => []);
            urls = task.outputs.map((id) => assets.find((row) => row.id === id)?.url).filter((url): url is string => Boolean(url));
        }
        if (!urls.length) {
            markNodeError(nodeId, "生成完成但未返回产物");
            return;
        }
        const clearRunning = () => setRunningNodeTasks((current) => {
            if (!(nodeId in current)) return current;
            const next = { ...current };
            delete next[nodeId];
            return next;
        });

        // Agent/独立生成节点（image/video 节点本身）：原位填充
        if (target.type === CanvasNodeType.Image || target.type === CanvasNodeType.Panorama) {
            pushHistory();
            if (urls.length === 1) {
                const asset = assets.find((row) => row.url === urls[0]);
                setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, content: urls[0], status: "success" as const, imageTaskId: task.id, progress: undefined, naturalWidth: asset?.width ?? undefined, naturalHeight: asset?.height ?? undefined, mimeType: asset?.mime ?? "image/png" } } : node)));
            } else {
                const children = urls.slice(1).map((url, index) => {
                    const asset = assets.find((row) => row.url === url);
                    const child = createCanvasNode(CanvasNodeType.Image, { x: target.position.x, y: target.position.y + (index + 1) * (target.height + 40) }, `${target.title} ${index + 2}`);
                    child.metadata = { content: url, status: "success" as const, batchRootId: nodeId, naturalWidth: asset?.width ?? undefined, naturalHeight: asset?.height ?? undefined, mimeType: asset?.mime ?? "image/png" };
                    return child;
                });
                const primaryAsset = assets.find((row) => row.url === urls[0]);
                setNodes((current) => [
                    ...current.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, content: urls[0], status: "success" as const, imageTaskId: task.id, isBatchRoot: true, batchChildIds: children.map((child) => child.id), primaryImageId: children[0]?.id ?? "", naturalWidth: primaryAsset?.width ?? undefined, naturalHeight: primaryAsset?.height ?? undefined } } : node)),
                    ...children,
                ]);
            }
            clearRunning();
            toast.success("生成完成");
            return;
        }
        if (target.type === CanvasNodeType.Video) {
            pushHistory();
            const asset = assets.find((row) => row.url === urls[0]);
            setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, content: urls[0], status: "success" as const, videoTaskId: task.id, progress: undefined, mimeType: asset?.mime ?? "video/mp4" } } : node)));
            clearRunning();
            toast.success("生成完成");
            return;
        }

        // 配置节点：产物作为新节点落画布并连线
        const mode = target.metadata?.generationMode === "video" ? "video" : "image";
        pushHistory();
        const baseX = target.position.x + target.width + 80;
        const created: CanvasNodeData[] = [];
        if (mode === "video") {
            const node = createCanvasNode(CanvasNodeType.Video, { x: baseX, y: target.position.y }, "生成视频");
            node.metadata = { content: urls[0], status: "success" as const, videoTaskId: task.id, mimeType: assets[0]?.mime ?? "video/mp4" };
            created.push(node);
        } else if (urls.length === 1) {
            const node = createCanvasNode(CanvasNodeType.Image, { x: baseX, y: target.position.y }, "生成图片");
            const asset = assets.find((row) => row.url === urls[0]);
            node.metadata = { content: urls[0], status: "success", imageTaskId: task.id, naturalWidth: asset?.width ?? undefined, naturalHeight: asset?.height ?? undefined, mimeType: asset?.mime ?? "image/png" };
            created.push(node);
        } else {
            const root = createCanvasNode(CanvasNodeType.Image, { x: baseX, y: target.position.y }, `图片组 ${urls.length}`);
            root.metadata = { content: urls[0], status: "success", isBatchRoot: true, batchChildIds: [], primaryImageId: "", imageTaskId: task.id };
            const children = urls.map((url, index) => {
                const asset = assets.find((row) => row.url === url);
                const child = createCanvasNode(CanvasNodeType.Image, { x: baseX, y: target.position.y + (index + 1) * (root.height + 40) }, `图片 ${index + 1}`);
                child.metadata = { content: url, status: "success", batchRootId: root.id, naturalWidth: asset?.width ?? undefined, naturalHeight: asset?.height ?? undefined, mimeType: asset?.mime ?? "image/png" };
                return child;
            });
            root.metadata.batchChildIds = children.map((child) => child.id);
            root.metadata.primaryImageId = children[0]?.id ?? "";
            created.push(root, ...children);
        }
        setNodes((current) => [
            ...current.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: "idle" as const, progress: undefined } } : node)),
            ...created,
        ]);
        setConnections((current) => [...current, ...created.slice(0, 1).map((node) => ({ id: uid("conn"), fromNodeId: nodeId, toNodeId: node.id }))]);
        clearRunning();
        toast.success(`生成完成：${created.length} 个节点已插入画布`);
    }, [nodes, pushHistory, markNodeError]);

    const handleGenerate = useCallback(async (nodeId: string) => {
        const configNode = nodes.find((node) => node.id === nodeId);
        if (!configNode) return;
        const mode = configNode.metadata?.generationMode === "video" ? "video" : "image";
        const models = modelsFor(creationConfig.data, mode);
        const model = models.find((item) => item.code === configNode.metadata?.model) ?? defaultModelFor(models);
        if (!model) {
            markNodeError(nodeId, "无可用模型：请联系 admin 在后台配置启用的模型");
            return;
        }
        const inputs = upstreamInputsOf(nodeId);
        const promptParts = [
            ...inputs.textNodes.map((node) => (node.metadata?.content || node.metadata?.prompt || "").trim()),
            (configNode.metadata?.composerContent ?? configNode.metadata?.prompt ?? "").trim(),
        ].filter(Boolean);
        if (!promptParts.length) {
            toast.error("请先输入描述或连接文本节点");
            return;
        }
        const resolutionOptions = Object.keys(model.params.resolutions ?? {});
        const resolution = mode === "image" ? configNode.metadata?.quality : configNode.metadata?.vquality;
        const finalResolution = resolutionOptions.includes(resolution ?? "") ? resolution : resolutionOptions[0];
        const ratioOptions = model.params.aspect_ratio?.options ?? [];
        const ratio = [configNode.metadata?.size, model.params.aspect_ratio?.default, ratioOptions[0], "1:1"].find((value): value is string => Boolean(value && ratioOptions.includes(value))) ?? "1:1";
        if (!finalResolution) {
            markNodeError(nodeId, "该模型未配置分辨率选项：请联系 admin 检查 models 表参数");
            return;
        }
        try {
            const task = await submitCanvasTask(
                mode === "image"
                    ? { type: "image", prompt: promptParts.join("\n"), model_code: model.code, params: { resolution: finalResolution, ratio, count: configNode.metadata?.count ?? model.params.default_generate_count ?? 1 } }
                    : { type: "video", prompt: promptParts.join("\n"), model_code: model.code, params: { resolution: finalResolution, ratio, duration_seconds: Number(configNode.metadata?.seconds) || 5 } },
            );
            setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: "loading", startedAt: Date.now(), progress: 0, errorDetails: undefined, imageTaskId: mode === "image" ? task.id : undefined, videoTaskId: mode === "video" ? task.id : undefined } } : node)));
            setRunningNodeTasks((current) => ({ ...current, [nodeId]: task.id }));
        } catch (error) {
            // 402 余额不足 / 503 未配置 Key / 404 模型——如实展示在节点 error 态（禁 mock）
            markNodeError(nodeId, error instanceof Error ? error.message : "提交失败");
            toast.error(error instanceof Error ? error.message : "提交失败");
        }
    }, [nodes, creationConfig.data, upstreamInputsOf, markNodeError]);

    // 轮询运行中任务（GET 即触发服务端向 provider 轮询）
    useEffect(() => {
        const entries = Object.entries(runningNodeTasks);
        if (!entries.length) return;
        let cancelled = false;
        const tick = async () => {
            for (const [nodeId, taskId] of entries) {
                if (cancelled) return;
                try {
                    const task = await pollCanvasTask(taskId);
                    if (cancelled) return;
                    if (task.status === "succeeded") await finalizeTask(nodeId, task);
                    else if (task.status === "failed") markNodeError(nodeId, task.error || "生成失败");
                } catch (error) {
                    markNodeError(nodeId, error instanceof Error ? error.message : "轮询失败");
                }
            }
        };
        const timer = setInterval(() => void tick(), 2500);
        void tick();
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [runningNodeTasks, finalizeTask, markNodeError]);

    // ---- 画布 Agent（Phase C）----
    const executeAction = useMemo(
        () =>
            createAgentExecutor({
                nodesRef,
                connectionsRef,
                selectedIdsRef,
                setNodes,
                setConnections,
                pushHistory,
                registerRunningTask: (nodeId, taskId) => setRunningNodeTasks((current) => ({ ...current, [nodeId]: taskId })),
                creationConfigRef,
                projectTitle: () => name,
                renameProject: (title) => {
                    setNameDirty(true);
                    setName(title);
                },
                canvasCenter: getCanvasCenter,
            }),
        [pushHistory, getCanvasCenter, name],
    );

    const assistantBridge = useMemo<AssistantBridge>(
        () => ({
            projectId,
            projectTitle: name,
            nodes,
            connections,
            selectedIds,
            viewport,
            textModel: "canvas-agent",
            imageDefaults: { resolution: Object.keys(modelsFor(creationConfig.data, "image")[0]?.params.resolutions ?? { "2k": 1 })[0] ?? "2k", ratio: modelsFor(creationConfig.data, "image")[0]?.params.aspect_ratio?.default ?? "1:1", count: 1 },
            videoDefaults: { resolution: Object.keys(modelsFor(creationConfig.data, "video")[0]?.params.resolutions ?? { "720p": 1 })[0] ?? "720p", seconds: 5 },
            imageModelCode: defaultModelFor(modelsFor(creationConfig.data, "image"))?.code ?? "",
            videoModelCode: defaultModelFor(modelsFor(creationConfig.data, "video"))?.code ?? "",
            executeAction,
            onSessionsChange: (sessions: CanvasAssistantSession[], nextActiveChatId: string | null) => {
                setChatSessions(sessions);
                setActiveChatId(nextActiveChatId);
            },
            onInsertAsset: (message) => {
                const text = (message.text ?? "").trim();
                if (!text) return;
                const node = createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), "对话便签");
                node.metadata = { content: text, status: "idle", fontSize: 14 };
                setNodes((current) => [...current, node]);
                toast.success("已插入画布");
            },
            onOpenUpload: () => fileInputRef.current?.click(),
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [projectId, name, nodes, connections, selectedIds, viewport, executeAction, creationConfig.data],
    );

    // ---- 交互：节点拖拽 ----
    const handleNodeMouseDown = useCallback((event: React.MouseEvent, nodeId: string) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const additive = event.shiftKey || event.metaKey || event.ctrlKey;
        setSelectedIds((current) => {
            if (additive) return current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId];
            return current.includes(nodeId) ? current : [nodeId];
        });
        setFocusedConnectionId(null);
        const targetIds = additive ? Array.from(new Set([...selectedIds, nodeId])) : selectedIds.includes(nodeId) ? selectedIds : [nodeId];
        const world = screenToCanvas(event.clientX, event.clientY);
        const origins = new Map(nodes.filter((node) => targetIds.includes(node.id)).map((node) => [node.id, node.position]));
        dragState.current = { movedIds: targetIds, startWorld: world, origins, moved: false };
    }, [nodes, selectedIds, screenToCanvas]);

    useEffect(() => {
        const handleMove = (event: MouseEvent) => {
            // 连线拖拽
            if (connectState.current) {
                setConnecting({ handle: connectState.current.handle, mouseWorld: screenToCanvas(event.clientX, event.clientY) });
                return;
            }
            // 框选
            if (selectionState.current) {
                const world = screenToCanvas(event.clientX, event.clientY);
                const box = { ...selectionState.current, currentWorldX: world.x, currentWorldY: world.y };
                selectionState.current = box;
                setSelectionBox(box);
                const hitIds = nodes
                    .filter((node) => node.type !== CanvasNodeType.Group)
                    .filter((node) => node.position.x < Math.max(box.startWorldX, box.currentWorldX) && node.position.x + node.width > Math.min(box.startWorldX, box.currentWorldX) && node.position.y < Math.max(box.startWorldY, box.currentWorldY) && node.position.y + node.height > Math.min(box.startWorldY, box.currentWorldY))
                    .map((node) => node.id);
                setSelectedIds(box.additive ? Array.from(new Set([...box.initialSelectedNodeIds, ...hitIds])) : hitIds);
                return;
            }
            // 节点拖拽
            const drag = dragState.current;
            if (!drag) return;
            const world = screenToCanvas(event.clientX, event.clientY);
            const dx = world.x - drag.startWorld.x;
            const dy = world.y - drag.startWorld.y;
            if (!drag.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
            if (!drag.moved) {
                drag.moved = true;
                pushHistory();
            }
            setNodes((current) => {
                const movedIds = new Set(drag.movedIds);
                const groupTarget = findGroupDropTarget(movedIds, current);
                const next = current.map((node) => {
                    if (!movedIds.has(node.id)) return node;
                    const origin = drag.origins.get(node.id);
                    if (!origin) return node;
                    return { ...node, position: { x: origin.x + dx, y: origin.y + dy } };
                });
                return groupTarget ? snapNodesIntoGroup(movedIds, next, groupTarget) : next;
            });
        };
        const handleUp = () => {
            dragState.current = null;
            if (selectionState.current) {
                selectionState.current = null;
                setSelectionBox(null);
            }
            if (connectState.current) {
                connectState.current = null;
                setConnecting(null);
            }
        };
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
        };
    }, [nodes, screenToCanvas, pushHistory]);

    // ---- 交互：连线 ----
    const handleConnectStart = useCallback((event: React.MouseEvent, nodeId: string, handleType: "source" | "target") => {
        event.preventDefault();
        event.stopPropagation();
        connectState.current = { handle: { nodeId, handleType } };
        setConnecting({ handle: { nodeId, handleType }, mouseWorld: screenToCanvas(event.clientX, event.clientY) });
    }, [screenToCanvas]);

    const connectNodes = useCallback((fromNodeId: string, toNodeId: string) => {
        if (fromNodeId === toNodeId) return;
        setConnections((current) => {
            if (current.some((connection) => connection.fromNodeId === fromNodeId && connection.toNodeId === toNodeId)) return current;
            pushHistory();
            return [...current, { id: uid("conn"), fromNodeId, toNodeId }];
        });
    }, [pushHistory]);

    // 节点 hover 时判断连线目标（画布级 hit-test，节点组件是兄弟元素）
    const connectionTargetId = useMemo(() => {
        if (!connecting) return undefined;
        return hoveredId && hoveredId !== connecting.handle.nodeId ? hoveredId : undefined;
    }, [connecting, hoveredId]);

    const handleConnectTargetClick = useCallback(() => {
        if (connecting && connectionTargetId) {
            const { nodeId, handleType } = connecting.handle;
            if (handleType === "source") connectNodes(nodeId, connectionTargetId);
            else connectNodes(connectionTargetId, nodeId);
            connectState.current = null;
            setConnecting(null);
        }
    }, [connecting, connectionTargetId, connectNodes]);

    // 点击悬停目标时完成连线（mouseup 在节点上时）
    useEffect(() => {
        if (!connectState.current || !connectionTargetId) return;
        // mouseup 由全局 handler 清理；这里在 hover 目标变化后监听一次 mouseup 完成连线
        const finish = () => {
            if (!connectState.current || !connectionTargetId) return;
            const { nodeId, handleType } = connectState.current.handle;
            if (handleType === "source") connectNodes(nodeId, connectionTargetId);
            else connectNodes(connectionTargetId, nodeId);
        };
        window.addEventListener("mouseup", finish, { once: true });
        return () => window.removeEventListener("mouseup", finish);
    }, [connectionTargetId, connectNodes]);

    // ---- 交互：画布事件 ----
    const handleCanvasMouseDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const additive = event.shiftKey || event.metaKey || event.ctrlKey;
        const world = screenToCanvas(event.clientX, event.clientY);
        selectionState.current = { startWorldX: world.x, startWorldY: world.y, currentWorldX: world.x, currentWorldY: world.y, additive, initialSelectedNodeIds: additive ? selectedIds : [] };
        if (!additive) setSelectedIds([]);
        setFocusedConnectionId(null);
        setCreateMenuOpen(false);
        setCanvasMenu(null);
        setContextMenu(null);
    }, [screenToCanvas, selectedIds]);

    const handleCanvasDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const world = screenToCanvas(event.clientX, event.clientY);
        setCanvasMenu({ x: event.clientX, y: event.clientY, world });
        setCreateMenuOpen(true);
    }, [screenToCanvas]);

    const handleCanvasContextMenu = useCallback((event: React.MouseEvent) => {
        event.preventDefault();
        setCanvasMenu({ x: event.clientX, y: event.clientY, world: screenToCanvas(event.clientX, event.clientY) });
        setCreateMenuOpen(false);
    }, [screenToCanvas]);

    const handleNodeContextMenu = useCallback((event: React.MouseEvent, nodeId: string) => {
        event.preventDefault();
        event.stopPropagation();
        if (!selectedIds.includes(nodeId)) setSelectedIds([nodeId]);
        setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId });
    }, [selectedIds]);

    const handleConnectionContextMenu = useCallback((event: React.MouseEvent, connectionId: string) => {
        setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId });
    }, []);

    // ---- 文件拖入/上传 ----
    const appendUploadedFile = useCallback(async (file: File, position: Position) => {
        try {
            if (file.type.startsWith("image/")) {
                const image = await uploadLocalImage(file);
                pushHistory();
                const node = createCanvasNode(CanvasNodeType.Image, position, file.name.replace(/\.[^.]+$/, ""));
                node.width = Math.min(Math.max(image.width, 220), 480);
                node.height = node.width * (image.height / image.width || 0.75);
                node.metadata = imageMetadata(image);
                setNodes((current) => [...current, node]);
            } else if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
                const uploaded = await uploadImageFile(file);
                pushHistory();
                const type = file.type.startsWith("video/") ? CanvasNodeType.Video : CanvasNodeType.Audio;
                const node = createCanvasNode(type, position, file.name.replace(/\.[^.]+$/, ""));
                node.metadata = { content: uploaded.url, assetId: uploaded.assetId, status: "success", mimeType: uploaded.mimeType, bytes: uploaded.bytes };
                setNodes((current) => [...current, node]);
            } else {
                toast.info("暂不支持该文件类型");
            }
        } catch (error) {
            toast.error(`上传失败：${error instanceof Error ? error.message : "未知错误"}`);
        }
    }, [pushHistory]);

    const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (!file) return;
        void appendUploadedFile(file, screenToCanvas(event.clientX, event.clientY));
    }, [appendUploadedFile, screenToCanvas]);

    // ---- 键盘 ----
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.closest("[contenteditable='true']");
            const meta = event.metaKey || event.ctrlKey;
            if (meta && event.key.toLowerCase() === "z" && !event.shiftKey) {
                if (typing) return;
                event.preventDefault();
                undoCanvas();
                return;
            }
            if (meta && (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey))) {
                if (typing) return;
                event.preventDefault();
                redoCanvas();
                return;
            }
            if (meta && event.key.toLowerCase() === "c") {
                if (typing) return;
                copySelectedNodes();
                return;
            }
            if (meta && event.key.toLowerCase() === "v") {
                if (typing) return;
                pasteCopiedNodes();
                return;
            }
            if (meta && event.key.toLowerCase() === "g") {
                if (typing) return;
                event.preventDefault();
                createGroupFromSelection();
                return;
            }
            if (meta && event.key === "0") {
                event.preventDefault();
                resetViewport();
                return;
            }
            if ((event.key === "Delete" || event.key === "Backspace") && !typing) {
                if (focusedConnectionId) {
                    event.preventDefault();
                    deleteConnection(focusedConnectionId);
                    return;
                }
                if (selectedIds.length) {
                    event.preventDefault();
                    deleteNodes(selectedIds);
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [undoCanvas, redoCanvas, copySelectedNodes, pasteCopiedNodes, createGroupFromSelection, selectedIds, focusedConnectionId, deleteConnection, deleteNodes]);

    const resetViewport = useCallback(() => {
        if (!nodes.length) {
            setViewport({ x: 0, y: 0, k: 1 });
            return;
        }
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const minX = Math.min(...nodes.map((node) => node.position.x));
        const minY = Math.min(...nodes.map((node) => node.position.y));
        const maxX = Math.max(...nodes.map((node) => node.position.x + node.width));
        const maxY = Math.max(...nodes.map((node) => node.position.y + node.height));
        const k = Math.min(Math.max(Math.min((rect.width - 120) / (maxX - minX || 1), (rect.height - 120) / (maxY - minY || 1)), 0.05), 1.5);
        setViewport({
            x: rect.width / 2 - ((minX + maxX) / 2) * k,
            y: rect.height / 2 - ((minY + maxY) / 2) * k,
            k,
        });
    }, [nodes]);

    // ---- 渲染 ----
    if (project.isLoading) {
        return <div className="flex flex-1 items-center justify-center text-sm text-dm-text-3">加载画布…</div>;
    }
    if (project.isError || !project.data) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <p className="text-sm text-dm-text-3">项目不存在</p>
                <a href="/ai-tool/assets-canvas" className="text-xs text-dm-accent">← 返回画布列表</a>
            </div>
        );
    }

    const zoomTo = (k: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const centerX = (rect.width / 2 - viewport.x) / viewport.k;
        const centerY = (rect.height / 2 - viewport.y) / viewport.k;
        setViewport({ x: rect.width / 2 - centerX * k, y: rect.height / 2 - centerY * k, k });
    };

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col">
            {/* 顶栏（对齐即梦：返回/项目名/保存态/对话开关） */}
            <header className="flex h-12 shrink-0 items-center gap-3 border-b border-dm-border px-4">
                <a href="/ai-tool/assets-canvas" aria-label="返回" className="text-dm-text-3 transition hover:text-dm-text">
                    <ArrowLeft size={16} />
                </a>
                <input
                    value={name}
                    onChange={(event) => {
                        setNameDirty(true);
                        setName(event.target.value);
                        scheduleSave();
                    }}
                    className="w-64 bg-transparent text-sm text-dm-text outline-none"
                    aria-label="项目名称"
                    maxLength={120}
                />
                <span className="text-[11px] text-dm-text-4">{saveState === "saved" ? "已保存" : saveState === "saving" ? "保存中…" : "未保存"}</span>
                <div className="flex-1" />
                <button
                    type="button"
                    title="对话"
                    onClick={() => setAssistantOpen((open) => !open)}
                    className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition ${assistantOpen ? "border-dm-accent text-dm-text" : "border-dm-border text-dm-text-2 hover:text-dm-text"}`}
                >
                    <MessageSquare size={14} />
                    对话
                </button>
            </header>

            <div className="flex min-h-0 flex-1">
            <div className="relative min-h-0 flex-1">
                <InfiniteCanvas
                    containerRef={containerRef}
                    viewport={viewport}
                    tool={canvasTool}
                    backgroundMode={backgroundMode}
                    onViewportChange={setViewport}
                    onCanvasMouseDown={handleCanvasMouseDown}
                    onCanvasDeselect={() => {
                        setSelectedIds([]);
                        setFocusedConnectionId(null);
                    }}
                    onCanvasDoubleClick={handleCanvasDoubleClick}
                    onContextMenu={handleCanvasContextMenu}
                    onDrop={handleDrop}
                >
                    {/* 连线层 */}
                    <svg className="pointer-events-none absolute left-0 top-0 h-full w-full overflow-visible">
                        {connections.map((connection) => {
                            const from = nodes.find((node) => node.id === connection.fromNodeId);
                            const to = nodes.find((node) => node.id === connection.toNodeId);
                            if (!from || !to) return null;
                            return (
                                <g key={connection.id} className="pointer-events-auto">
                                    <ConnectionPath
                                        connection={connection}
                                        from={from}
                                        to={to}
                                        active={focusedConnectionId === connection.id || (selectedIds.includes(connection.fromNodeId) && selectedIds.includes(connection.toNodeId))}
                                        onSelect={() => {
                                            setFocusedConnectionId(connection.id);
                                            setSelectedIds([]);
                                        }}
                                        onContextMenu={(event) => handleConnectionContextMenu(event, connection.id)}
                                    />
                                </g>
                            );
                        })}
                        {connecting ? (
                            <ActiveConnectionPath
                                node={nodes.find((node) => node.id === connecting.handle.nodeId)}
                                handle={connecting.handle.handleType === "source" ? { nodeId: connecting.handle.nodeId, handleType: "source" } : { nodeId: connecting.handle.nodeId, handleType: "target" }}
                                mouseWorld={connecting.mouseWorld}
                                target={connectionTargetId ? nodes.find((node) => node.id === connectionTargetId) : undefined}
                            />
                        ) : null}
                    </svg>

                    {/* 节点层 */}
                    {nodes.map((node) => (
                        <CanvasNode
                            key={node.id}
                            data={node}
                            scale={viewport.k}
                            isSelected={selectedIds.includes(node.id)}
                            isRelated={relatedIds.has(node.id) && !selectedIds.includes(node.id)}
                            isFocusRelated={false}
                            isConnectionTarget={connectionTargetId === node.id}
                            isConnecting={Boolean(connecting)}
                            showPanel={false}
                            showImageInfo={showImageInfo}
                            mentionReferences={[]}
                            renderNodeContent={node.type === CanvasNodeType.Config ? (target) => {
                                const inputs = upstreamInputsOf(target.id);
                                const mode = target.metadata?.generationMode === "video" ? "video" : "image";
                                return (
                                    <ConfigNodePanel
                                        node={target}
                                        isRunning={Boolean(runningNodeTasks[target.id])}
                                        imageModels={modelsFor(creationConfig.data, "image")}
                                        videoModels={modelsFor(creationConfig.data, "video")}
                                        inputSummary={{ textCount: inputs.textNodes.length, imageCount: inputs.imageNodes.length, videoCount: inputs.videoNodes.length, audioCount: inputs.audioNodes.length }}
                                        onConfigChange={handleConfigNodeChange}
                                        onGenerate={(id) => void handleGenerate(id)}
                                    />
                                );
                            } : undefined}
                            onMouseDown={handleNodeMouseDown}
                            onHoverStart={setHoveredId}
                            onHoverEnd={() => setHoveredId(null)}
                            onConnectStart={handleConnectStart}
                            onResize={(nodeId, width, height, position) => {
                                setNodes((current) => current.map((item) => (item.id === nodeId ? { ...item, width, height, position: position ?? item.position } : item)));
                            }}
                            onContentChange={(nodeId, content) => {
                                setNodes((current) => current.map((item) => (item.id === nodeId ? { ...item, metadata: { ...item.metadata, content } } : item)));
                            }}
                            onTitleChange={(nodeId, title) => {
                                setNodes((current) => current.map((item) => (item.id === nodeId ? { ...item, title } : item)));
                            }}
                            onToggleBatch={undefined}
                            onRetry={(target) => {
                                if (target.metadata?.imageTaskId || target.metadata?.videoTaskId) void handleGenerate(target.id);
                            }}
                            onContextMenu={handleNodeContextMenu}
                        />
                    ))}

                    {/* 框选矩形 */}
                    {selectionBox ? (
                        <div
                            className="pointer-events-none absolute border"
                            style={{
                                left: Math.min(selectionBox.startWorldX, selectionBox.currentWorldX),
                                top: Math.min(selectionBox.startWorldY, selectionBox.currentWorldY),
                                width: Math.abs(selectionBox.currentWorldX - selectionBox.startWorldX),
                                height: Math.abs(selectionBox.currentWorldY - selectionBox.startWorldY),
                                borderColor: theme.canvas.selectionStroke,
                                background: theme.canvas.selectionFill,
                            }}
                        />
                    ) : null}
                </InfiniteCanvas>

                {/* 空态 hero（对齐即梦：这次创作想从哪里开始？） */}
                {!nodes.length && !project.isLoading ? (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4">
                        <h2 className="text-lg font-medium" style={{ color: theme.node.text }}>这次创作想从哪里开始？</h2>
                        <div className="pointer-events-auto flex items-center gap-3">
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-9 items-center gap-2 rounded-lg border px-4 text-xs" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                                <Upload size={14} />
                                本地上传
                            </button>
                            <button type="button" onClick={() => toast.info("资产选择器将在 Phase B 开放")} className="flex h-9 items-center gap-2 rounded-lg border px-4 text-xs" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                                <FolderOpen size={14} />
                                选择资产
                            </button>
                        </div>
                        <p className="text-xs" style={{ color: theme.node.muted }}>没有好创意？先和Agent聊聊，或者搜一搜站内灵感吧！</p>
                    </div>
                ) : null}

                {/* 双击空白：创建节点菜单 */}
                {createMenuOpen && canvasMenu ? <NodeCreateMenu menu={canvasMenu} onClose={() => setCreateMenuOpen(false)} onCreate={createNode} /> : null}

                {/* 空白右键：粘贴/居中视图（对齐即梦实测） */}
                {!createMenuOpen && canvasMenu ? (
                    <div
                        className="fixed z-[80] min-w-44 overflow-hidden rounded-xl border py-1 shadow-2xl"
                        style={{ left: canvasMenu.x, top: canvasMenu.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        <button type="button" className="flex w-full items-center justify-between gap-6 px-3 py-2 text-left text-xs hover:opacity-80" onClick={() => { pasteCopiedNodes(); setCanvasMenu(null); }}>
                            <span>粘贴</span>
                            <span className="opacity-50">⌘ V</span>
                        </button>
                        <button type="button" className="flex w-full items-center justify-between gap-6 px-3 py-2 text-left text-xs hover:opacity-80" onClick={() => { resetViewport(); setCanvasMenu(null); }}>
                            <span>居中视图</span>
                            <span className="opacity-50">⌘ 0</span>
                        </button>
                    </div>
                ) : null}

                {contextMenu ? (
                    <CanvasNodeContextMenu
                        menu={contextMenu}
                        canCaptureVideoFrame={false}
                        onClose={() => setContextMenu(null)}
                        onCaptureVideoFrame={() => undefined}
                        onDuplicate={() => contextMenu.type === "node" && duplicateNode(contextMenu.nodeId)}
                        onDelete={() => contextMenu.type === "node" ? deleteNodes([contextMenu.nodeId]) : deleteConnection(contextMenu.connectionId)}
                    />
                ) : null}

                {minimapOpen ? <Minimap nodes={nodes} viewport={viewport} viewportSize={viewportSize} onViewportChange={setViewport} /> : null}

                <CanvasZoomControls scale={viewport.k} onScaleChange={zoomTo} onReset={resetViewport} isMiniMapOpen={minimapOpen} onToggleMiniMap={() => setMinimapOpen((open) => !open)} />

                <CanvasToolbar
                    selectedCount={selectedIds.length}
                    canvasTool={canvasTool}
                    canUndo={undoStack.length > 0}
                    canRedo={redoStack.length > 0}
                    backgroundMode={backgroundMode}
                    showImageInfo={showImageInfo}
                    onAddText={() => createNode(CanvasNodeType.Text, getCanvasCenter())}
                    onAddImage={() => createNode(CanvasNodeType.Image, getCanvasCenter())}
                    onAddVideo={() => createNode(CanvasNodeType.Video, getCanvasCenter())}
                    onAddAudio={() => createNode(CanvasNodeType.Audio, getCanvasCenter())}
                    onAddPanorama={() => createNode(CanvasNodeType.Panorama, getCanvasCenter())}
                    onAddDirector={() => toast.info("导演台将在 Phase D 开放")}
                    onAddConfig={() => createNode(CanvasNodeType.Config, getCanvasCenter())}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    onUpload={() => fileInputRef.current?.click()}
                    onDelete={() => deleteNodes(selectedIds)}
                    onClear={clearCanvas}
                    onCanvasToolChange={setCanvasTool}
                    onBackgroundModeChange={setBackgroundMode}
                    onShowImageInfoChange={setShowImageInfo}
                    onOpenAssetLibrary={() => toast.info("素材库选择器将在 Phase B 开放")}
                    onOpenMyAssets={() => toast.info("我的素材将在 Phase B 开放")}
                />

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/mp4,video/quicktime,audio/mpeg,audio/wav"
                    className="hidden"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void appendUploadedFile(file, getCanvasCenter());
                        event.target.value = "";
                    }}
                />
            </div>
            <CanvasAssistantPanel bridge={assistantBridge} open={assistantOpen} onClose={() => setAssistantOpen(false)} />
            </div>
        </div>
    );
}

function NodeCreateMenu({ menu, onClose, onCreate }: { menu: { x: number; y: number; world: Position }; onClose: () => void; onCreate: (type: CanvasNodeType, position: Position) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    useEffect(() => {
        const close = (event: PointerEvent) => {
            if (event.target instanceof Element && event.target.closest("[data-node-create-menu]")) return;
            onClose();
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [onClose]);

    const items: { type: CanvasNodeType; label: string }[] = [
        { type: CanvasNodeType.Text, label: "文本" },
        { type: CanvasNodeType.Image, label: "图片" },
        { type: CanvasNodeType.Video, label: "视频" },
        { type: CanvasNodeType.Audio, label: "音频" },
        { type: CanvasNodeType.Config, label: "生成配置" },
        { type: CanvasNodeType.Panorama, label: "全景图" },
    ];
    return (
        <div
            data-node-create-menu
            className="fixed z-[80] min-w-44 overflow-hidden rounded-xl border py-1 shadow-2xl"
            style={{ left: menu.x, top: menu.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {items.map((item) => (
                <button key={item.type} type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:opacity-80" onClick={() => onCreate(item.type, menu.world)}>
                    {item.label}
                </button>
            ))}
        </div>
    );
}
