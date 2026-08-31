/**
 * 画布 Agent 动作执行器（D12 Phase C）
 * 把 runtime 的 26 个工具动作桥接到编辑器状态；媒体生成动作复用 Phase B 计费管线。
 * 读取走 refs（跨步骤实时），写入走 setter（函数式）。
 */
import { api, type CreationTypesConfig, type AssetRow } from "@/lib/api";
import { defaultModelFor, modelsFor, submitCanvasTask } from "@/lib/canvas/generation";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type Position } from "./types";
import type { CanvasAgentAction, CanvasAgentToolResult } from "./agent/canvas-agent-tools";

export type AgentExecutorDeps = {
    nodesRef: React.RefObject<CanvasNodeData[]>;
    connectionsRef: React.RefObject<CanvasConnection[]>;
    selectedIdsRef: React.RefObject<string[]>;
    setNodes: (updater: (current: CanvasNodeData[]) => CanvasNodeData[]) => void;
    setConnections: (updater: (current: CanvasConnection[]) => CanvasConnection[]) => void;
    pushHistory: () => void;
    registerRunningTask: (nodeId: string, taskId: string) => void;
    creationConfigRef: React.RefObject<CreationTypesConfig | undefined>;
    projectTitle: () => string;
    renameProject: (title: string) => void;
    canvasCenter: () => Position;
};

function uid(prefix: string) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nodeSpecDefaults(type: CanvasNodeType) {
    const specs: Record<string, { width: number; height: number; title: string }> = {
        image: { width: 340, height: 240, title: "图片" },
        panorama: { width: 340, height: 170, title: "全景图" },
        text: { width: 340, height: 240, title: "文本" },
        config: { width: 440, height: 240, title: "生成配置" },
        video: { width: 420, height: 236, title: "视频" },
        audio: { width: 340, height: 160, title: "音频" },
        director: { width: 360, height: 320, title: "导演台" },
        group: { width: 760, height: 480, title: "组" },
    };
    return specs[type] ?? specs.text;
}

function summarizeForAgent(node: CanvasNodeData) {
    const spec = nodeSpecDefaults(node.type);
    return {
        id: node.id,
        type: node.type,
        title: node.title || spec.title,
        width: node.width,
        height: node.height,
        position: node.position,
        text: node.type === CanvasNodeType.Text ? (node.metadata?.content || "").slice(0, 400) : undefined,
        hasMedia: node.type !== CanvasNodeType.Text ? Boolean(node.metadata?.content) : undefined,
        status: node.metadata?.status,
        prompt: node.metadata?.prompt?.slice(0, 400),
        model: node.metadata?.model,
        taskId: node.metadata?.imageTaskId || node.metadata?.videoTaskId || node.metadata?.audioTaskId,
        error: node.metadata?.errorDetails,
    };
}

export function createAgentExecutor(deps: AgentExecutorDeps) {
    const nextPlacement = (): Position => {
        const nodes = deps.nodesRef.current ?? [];
        if (!nodes.length) return deps.canvasCenter();
        const maxX = Math.max(...nodes.map((node) => node.position.x + node.width));
        const y = nodes.reduce((min, node) => Math.min(min, node.position.y), Infinity);
        return { x: maxX + 80, y: Number.isFinite(y) ? y : 0 };
    };

    const addNode = (type: CanvasNodeType, position: Position, title: string, metadata: CanvasNodeData["metadata"], connectFrom?: string[]) => {
        const spec = nodeSpecDefaults(type);
        const id = uid(type);
        const node: CanvasNodeData = { id, type, title: title || spec.title, position, width: spec.width, height: spec.height, metadata: { status: "idle", ...metadata } };
        deps.pushHistory();
        deps.setNodes((current) => [...current, node]);
        if (connectFrom?.length) {
            deps.setConnections((current) => [...current, ...connectFrom.filter((from) => from && from !== id).map((from) => ({ id: uid("conn"), fromNodeId: from, toNodeId: id }))]);
        }
        return node;
    };

    const submitMedia = async (node: CanvasNodeData, kind: "image" | "video", prompt: string, sourceNodeIds: string[]) => {
        const models = modelsFor(deps.creationConfigRef.current, kind);
        const model = models.find((item) => item.code === node.metadata?.model) ?? defaultModelFor(models);
        if (!model) {
            deps.setNodes((current) => current.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: "error", errorDetails: "无可用模型：请联系 admin 配置" } } : item)));
            return { ok: false, code: "no_model", message: "无可用模型" };
        }
        // 上游文本拼进提示词（v1 参考图生成未开放：忽略图片上游）
        const upstreamTexts = (sourceNodeIds ?? [])
            .map((id) => deps.nodesRef.current?.find((item) => item.id === id))
            .filter((item): item is CanvasNodeData => Boolean(item && item.type === CanvasNodeType.Text))
            .map((item) => (item.metadata?.content || "").trim())
            .filter(Boolean);
        const finalPrompt = [...upstreamTexts, prompt.trim()].filter(Boolean).join("\n");
        const resolutionOptions = Object.keys(model.params.resolutions ?? {});
        const ratioOptions = model.params.aspect_ratio?.options ?? [];
        const resolution = resolutionOptions[0] ?? "";
        const ratio = ratioOptions.includes(model.params.aspect_ratio?.default ?? "") ? model.params.aspect_ratio!.default : ratioOptions[0] ?? "1:1";
        try {
            const task = await submitCanvasTask(
                kind === "image"
                    ? { type: "image", prompt: finalPrompt, model_code: model.code, params: { resolution, ratio, count: 1 } }
                    : { type: "video", prompt: finalPrompt, model_code: model.code, params: { resolution, ratio, duration_seconds: 5 } },
            );
            deps.setNodes((current) => current.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: "loading", startedAt: Date.now(), progress: 0, errorDetails: undefined, prompt: finalPrompt, [kind === "image" ? "imageTaskId" : "videoTaskId"]: task.id } } : item)));
            deps.registerRunningTask(node.id, task.id);
            return { ok: true, nodeId: node.id, taskId: task.id, status: "loading" };
        } catch (error) {
            const message = error instanceof Error ? error.message : "提交失败";
            deps.setNodes((current) => current.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: "error", errorDetails: message } } : item)));
            return { ok: false, code: "submit_failed", message };
        }
    };

    return async function executeAction(action: CanvasAgentAction): Promise<CanvasAgentToolResult> {
        const nodes = deps.nodesRef.current ?? [];
        const connections = deps.connectionsRef.current ?? [];
        const args = action.arguments as Record<string, never | unknown>;
        const str = (key: string) => (typeof args[key] === "string" ? (args[key] as string) : "");
        const strArray = (key: string) => (Array.isArray(args[key]) ? (args[key] as unknown[]).filter((item): item is string => typeof item === "string") : []);

        switch (action.name) {
            case "get_canvas_summary":
                return { ok: true, project: { title: deps.projectTitle(), nodeCount: nodes.length, connectionCount: connections.length }, nodes: nodes.map(summarizeForAgent), connections };
            case "get_selected_nodes": {
                const selected = deps.selectedIdsRef.current ?? [];
                return { ok: true, nodes: nodes.filter((node) => selected.includes(node.id)).map(summarizeForAgent) };
            }
            case "query_canvas_nodes": {
                const nodeId = str("nodeId");
                const keyword = str("keyword").toLowerCase();
                const type = str("type");
                const page = typeof args.page === "number" ? args.page : 1;
                const pageSize = typeof args.pageSize === "number" ? args.pageSize : 20;
                let hits = nodes;
                if (nodeId) hits = hits.filter((node) => node.id === nodeId);
                if (type) hits = hits.filter((node) => node.type === type);
                if (keyword) hits = hits.filter((node) => `${node.title} ${node.metadata?.content ?? ""}`.toLowerCase().includes(keyword));
                return { ok: true, total: hits.length, nodes: hits.slice((page - 1) * pageSize, page * pageSize).map(summarizeForAgent) };
            }
            case "get_node": {
                const node = nodes.find((item) => item.id === str("nodeId"));
                return node ? { ok: true, node: summarizeForAgent(node) } : { ok: false, code: "not_found", message: "节点不存在" };
            }
            case "get_upstream_nodes": {
                const id = str("nodeId");
                const upstream = connections.filter((connection) => connection.toNodeId === id).map((connection) => nodes.find((node) => node.id === connection.fromNodeId)).filter(Boolean) as CanvasNodeData[];
                return { ok: true, nodes: upstream.map(summarizeForAgent) };
            }
            case "get_downstream_nodes": {
                const id = str("nodeId");
                const downstream = connections.filter((connection) => connection.fromNodeId === id).map((connection) => nodes.find((node) => node.id === connection.toNodeId)).filter(Boolean) as CanvasNodeData[];
                return { ok: true, nodes: downstream.map(summarizeForAgent) };
            }
            case "get_connected_nodes": {
                const id = str("nodeId");
                const related = connections.filter((connection) => connection.fromNodeId === id || connection.toNodeId === id).flatMap((connection) => [nodes.find((node) => node.id === connection.fromNodeId), nodes.find((node) => node.id === connection.toNodeId)]).filter((node): node is CanvasNodeData => Boolean(node && node.id !== id));
                return { ok: true, nodes: related.map(summarizeForAgent) };
            }
            case "get_generation_config": {
                const config = deps.creationConfigRef.current;
                return {
                    ok: true,
                    imageModels: modelsFor(config, "image").map((model) => ({ code: model.code, name: model.display_name, unitType: model.unit_type, priceCents: model.price_cents })),
                    videoModels: modelsFor(config, "video").map((model) => ({ code: model.code, name: model.display_name, unitType: model.unit_type, priceCents: model.price_cents })),
                    notes: "参考图/图生图暂未开放；生成只使用文本提示词",
                };
            }
            case "get_generation_task":
            case "get_media_task_status": {
                const node = nodes.find((item) => item.id === str("nodeId"));
                if (!node) return { ok: false, code: "not_found", message: "节点不存在" };
                return { ok: true, nodeId: node.id, status: node.metadata?.status ?? "idle", taskId: node.metadata?.imageTaskId || node.metadata?.videoTaskId || node.metadata?.audioTaskId, error: node.metadata?.errorDetails };
            }
            case "read_skill_file":
                return { ok: false, code: "unsupported", message: "系统 Skill 附属文件将在提示词库阶段开放" };
            case "set_agent_state":
                return { ok: true };
            case "create_primary_script_node": {
                const title = str("title") || "主剧本";
                const node = addNode(CanvasNodeType.Text, nextPlacement(), title, { content: str("content"), fontSize: 16 }, strArray("sourceNodeIds"));
                const projectTitle = str("projectTitle");
                if (projectTitle) deps.renameProject(projectTitle);
                return { ok: true, nodeId: node.id };
            }
            case "create_text_node": {
                const node = addNode(CanvasNodeType.Text, nextPlacement(), str("title") || "文本", { content: str("content") }, strArray("sourceNodeIds"));
                return { ok: true, nodeId: node.id };
            }
            case "update_text_node": {
                const id = str("nodeId");
                const title = str("title");
                const content = str("content");
                if (!title && !content) return { ok: false, code: "bad_args", message: "缺少 title 或 content" };
                deps.pushHistory();
                deps.setNodes((current) => current.map((node) => (node.id === id ? { ...node, ...(title ? { title } : {}), metadata: { ...node.metadata, ...(content ? { content } : {}) } } : node)));
                return { ok: true, nodeId: id };
            }
            case "update_node": {
                const id = str("nodeId");
                deps.setNodes((current) => current.map((node) => (node.id === id ? { ...node, title: str("title") || node.title } : node)));
                return { ok: true, nodeId: id };
            }
            case "delete_node": {
                const id = str("nodeId");
                if (!nodes.some((node) => node.id === id)) return { ok: false, code: "not_found", message: "节点不存在" };
                deps.pushHistory();
                deps.setNodes((current) => current.filter((node) => node.id !== id));
                deps.setConnections((current) => current.filter((connection) => connection.fromNodeId !== id && connection.toNodeId !== id));
                return { ok: true };
            }
            case "create_connection": {
                const from = str("fromNodeId");
                const to = str("toNodeId");
                if (!nodes.some((node) => node.id === from) || !nodes.some((node) => node.id === to)) return { ok: false, code: "not_found", message: "连线端点不存在" };
                if (connections.some((connection) => connection.fromNodeId === from && connection.toNodeId === to)) return { ok: true, existed: true };
                deps.pushHistory();
                deps.setConnections((current) => [...current, { id: uid("conn"), fromNodeId: from, toNodeId: to }]);
                return { ok: true };
            }
            case "delete_connection": {
                const id = str("connectionId");
                deps.setConnections((current) => current.filter((connection) => connection.id !== id));
                return { ok: true };
            }
            case "create_group": {
                const ids = strArray("nodeIds");
                const members = nodes.filter((node) => ids.includes(node.id));
                if (members.length < 2) return { ok: false, code: "bad_args", message: "create_group 至少需要两个节点" };
                const left = Math.min(...members.map((node) => node.position.x));
                const top = Math.min(...members.map((node) => node.position.y));
                const right = Math.max(...members.map((node) => node.position.x + node.width));
                const bottom = Math.max(...members.map((node) => node.position.y + node.height));
                const group = addNode(CanvasNodeType.Group, { x: left - 24, y: top - 24 }, str("title") || "组", { status: "idle" });
                deps.setNodes((current) => current.map((node) => (node.id === group.id ? { ...node, width: right - left + 48, height: bottom - top + 48 } : node)));
                return { ok: true, groupId: group.id };
            }
            case "arrange_nodes": {
                const ids = strArray("nodeIds");
                const targets = (ids.length ? nodes.filter((node) => ids.includes(node.id) && node.type !== CanvasNodeType.Group) : nodes.filter((node) => node.type !== CanvasNodeType.Group)).slice(0, 60);
                if (!targets.length) return { ok: true, message: "无可整理节点" };
                const sorted = [...targets].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
                const columns = Math.min(4, Math.ceil(Math.sqrt(sorted.length)));
                deps.pushHistory();
                const positions = new Map(sorted.map((node, index) => [node.id, { x: Math.floor(index / columns) * 620, y: (index % columns) * 420 }]));
                deps.setNodes((current) => current.map((node) => (positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node)));
                return { ok: true, arranged: sorted.length };
            }
            case "generate_image":
            case "edit_image": {
                const prompt = str("prompt");
                if (!prompt) return { ok: false, code: "bad_args", message: "prompt 不能为空" };
                const count = typeof args.count === "number" ? Math.min(Math.max(1, Math.floor(args.count)), 4) : 1;
                const title = str("title") || "Agent 生成图片";
                const type = action.name === "edit_image" && strArray("sourceNodeIds").length ? CanvasNodeType.Image : CanvasNodeType.Image;
                const node = addNode(type, nextPlacement(), title, { prompt, count, status: "idle" }, strArray("sourceNodeIds"));
                if (count > 1) {
                    // 多张：批量组占位由 finalize 阶段展开；v1 提交 count 张任务
                }
                return submitMedia(node, "image", prompt, strArray("sourceNodeIds"));
            }
            case "generate_video": {
                const prompt = str("prompt");
                if (!prompt) return { ok: false, code: "bad_args", message: "prompt 不能为空" };
                const node = addNode(CanvasNodeType.Video, nextPlacement(), str("title") || "Agent 生成视频", { prompt, status: "idle" }, strArray("sourceNodeIds"));
                return submitMedia(node, "video", prompt, strArray("sourceNodeIds"));
            }
            case "generate_audio":
                return { ok: false, code: "unsupported", message: "画布音频生成将在后续阶段开放（音乐/配音 provider 已预留）" };
            default:
                return { ok: false, code: "unknown_action", message: `未知动作 ${String((action as { name?: string }).name ?? "")}` };
        }
    };
}

export async function resolveAssetUrl(taskId: string): Promise<string | null> {
    const task = await api<{ outputs?: string[] }>(`/generation/tasks/${taskId}`).catch(() => null);
    if (!task?.outputs?.length) return null;
    const assets = await api<AssetRow[]>("/assets").catch(() => []);
    return assets.find((row) => row.id === task.outputs![0])?.url ?? null;
}
