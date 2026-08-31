/**
 * 画布 Agent 上下文构建（D12 Phase C）
 * 基于 vendor/infinite-canvas canvas-agent-context（AGPL-3.0）简化：
 * AiConfig/多渠道 TTS 能力探测替换为本项目 creation-config（admin models 表驱动）。
 */
import { CanvasNodeType, type CanvasAgentState, type CanvasConnection, type CanvasNodeData } from "../types";

export type CanvasAgentContextNode = {
    id: string;
    type: CanvasNodeType;
    title: string;
    text?: string;
    mediaUrl?: string;
    hasMedia?: boolean;
    status?: string;
    prompt?: string;
    model?: string;
    size?: string;
    seconds?: string;
    taskId?: string;
    error?: string;
    groupId?: string;
};

export type CanvasAgentContext = {
    project: {
        id: string;
        title: string;
        nodeCount: number;
        connectionCount: number;
    };
    agentState: CanvasAgentState;
    selectedNodeIds: string[];
    nodes: CanvasAgentContextNode[];
    connections: CanvasConnection[];
    generation: {
        autoGenerateMedia: boolean;
        imageModel: string;
        videoModel: string;
        imageResolution: string;
        imageRatio: string;
        imageCount: number;
        videoResolution: string;
        videoSeconds: number;
    };
    tasks: Array<{
        nodeId: string;
        type: CanvasNodeType;
        status: string;
        taskId: string;
        progress?: number;
        error?: string;
    }>;
};

type BuildCanvasAgentContextInput = {
    projectId: string;
    projectTitle: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedNodeIds: Iterable<string>;
    imageModelCode: string;
    videoModelCode: string;
    imageDefaults: { resolution: string; ratio: string; count: number };
    videoDefaults: { resolution: string; seconds: number };
    autoGenerateMedia: boolean;
    agentState: CanvasAgentState;
};

const MAX_CONTEXT_NODES = 120;
const MAX_TEXT_LENGTH = 4000;

export function buildCanvasAgentContext(input: BuildCanvasAgentContextInput): CanvasAgentContext {
    const selectedNodeIds = Array.from(input.selectedNodeIds);
    const prioritizedIds = new Set<string>([
        ...selectedNodeIds,
        ...input.agentState.approvedNodeIds,
        ...input.agentState.referenceNodeIds,
    ]);
    input.connections.forEach((connection) => {
        if (prioritizedIds.has(connection.fromNodeId) || prioritizedIds.has(connection.toNodeId)) {
            prioritizedIds.add(connection.fromNodeId);
            prioritizedIds.add(connection.toNodeId);
        }
    });
    input.nodes.forEach((node) => {
        if (node.metadata?.status === "loading" || node.metadata?.status === "error") prioritizedIds.add(node.id);
    });

    const orderedNodes = [
        ...input.nodes.filter((node) => prioritizedIds.has(node.id)),
        ...input.nodes.filter((node) => !prioritizedIds.has(node.id)),
    ].slice(0, MAX_CONTEXT_NODES);
    const includedIds = new Set(orderedNodes.map((node) => node.id));

    return {
        project: {
            id: input.projectId,
            title: input.projectTitle,
            nodeCount: input.nodes.length,
            connectionCount: input.connections.length,
        },
        agentState: input.agentState,
        selectedNodeIds,
        nodes: orderedNodes.map(summarizeNode),
        connections: input.connections.filter((connection) => includedIds.has(connection.fromNodeId) && includedIds.has(connection.toNodeId)),
        generation: {
            autoGenerateMedia: input.autoGenerateMedia,
            imageModel: input.imageModelCode,
            videoModel: input.videoModelCode,
            imageResolution: input.imageDefaults.resolution,
            imageRatio: input.imageDefaults.ratio,
            imageCount: input.imageDefaults.count,
            videoResolution: input.videoDefaults.resolution,
            videoSeconds: input.videoDefaults.seconds,
        },
        tasks: orderedNodes.flatMap((node) => {
            const taskId = mediaTaskId(node);
            if (!taskId) return [];
            return [
                {
                    nodeId: node.id,
                    type: node.type,
                    status: node.metadata?.status || "idle",
                    taskId,
                    progress: node.metadata?.progress,
                    error: node.metadata?.errorDetails,
                },
            ];
        }),
    };
}

export function serializeCanvasAgentContext(context: CanvasAgentContext) {
    return JSON.stringify(context);
}

function summarizeNode(node: CanvasNodeData): CanvasAgentContextNode {
    const content = node.metadata?.content || "";
    const isText = node.type === CanvasNodeType.Text;
    const mediaUrl = !isText && content && !content.startsWith("data:") ? content : undefined;
    return {
        id: node.id,
        type: node.type,
        title: node.title,
        text: isText && content ? content.slice(0, MAX_TEXT_LENGTH) : undefined,
        mediaUrl,
        hasMedia: !isText ? Boolean(content) : undefined,
        status: node.metadata?.status,
        prompt: node.metadata?.prompt?.slice(0, MAX_TEXT_LENGTH),
        model: node.metadata?.model,
        size: node.metadata?.size,
        seconds: node.metadata?.seconds,
        taskId: mediaTaskId(node) || undefined,
        error: node.metadata?.errorDetails,
        groupId: node.metadata?.groupId,
    };
}

function mediaTaskId(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Video) return node.metadata?.videoTaskId || "";
    if (node.type === CanvasNodeType.Audio) return node.metadata?.audioTaskId || "";
    if (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Panorama) return node.metadata?.imageTaskId || "";
    return "";
}
