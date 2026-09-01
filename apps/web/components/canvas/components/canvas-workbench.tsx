"use client";
/**
 * 生图工作台（D12 Phase D-3）——三 tab：生成记录 / 提示词库 / 创作工作流。
 * 生成记录：任务列表(分类/失败详情/重试/插入画布) + 侧边/底部布局切换；
 * 提示词库：内置精选集（远程 GitHub 源随 admin 提示词管理 v2 开放）；
 * 创作工作流：官方技能 plan_template 展开为画布节点图（AI 创建工作流走画布 Agent 的 workflow 技能）。
 * 形态参照 vendor/infinite-canvas canvas-side-panel（AGPL-3.0），数据全接本项目 API。
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Grid2x2, LayoutGrid, Lightbulb, RefreshCw, Sparkles, WandSparkles } from "lucide-react";

import { api, formatUsd, type AgentSkill, type GenTask, type AssetRow } from "@/lib/api";
import { fetchRemotePrompts, type RemotePrompt } from "@/lib/canvas/prompt-sources";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "../theme-store";
import { CanvasNodeType, type CanvasNodeData, type Position } from "../types";

export type WorkbenchLayout = "side" | "bottom";

type WorkbenchProps = {
    open: boolean;
    layout: WorkbenchLayout;
    onLayoutChange: (layout: WorkbenchLayout) => void;
    onClose: () => void;
    imageModelsCount: number;
    onInsertImageNode: (url: string, asset: AssetRow | undefined, title: string) => void;
    onRetryTask: (task: GenTask) => void;
    onUsePrompt: (prompt: string) => void;
    onInstantiateWorkflow: (skill: { title: string; steps?: WorkflowStep[]; plan_template?: { steps?: WorkflowStep[] } }, prompt: string) => void;
    getGraphSnapshot: () => { nodes: CanvasNodeData[]; connections: Array<{ fromNodeId: string; toNodeId: string }> };
    onInstantiateTemplate: (snapshot: { nodes: CanvasNodeData[]; connections: Array<{ fromNodeId: string; toNodeId: string }> }) => void;
};

export type WorkflowStep = { title?: string; prompt?: string; type?: string };

// ---------- 内置提示词库（分标签精选；admin 远程源管理 v2 开放） ----------
const PROMPT_LIBRARY: Array<{ tag: string; items: Array<{ title: string; prompt: string }> }> = [
    {
        tag: "人像",
        items: [
            { title: "电影感人像", prompt: "电影感人像特写，侧逆光，浅景深，肤色自然细腻，背景虚化的城市夜景霓虹，85mm 镜头质感" },
            { title: "商务形象照", prompt: "专业商务形象照，柔光棚拍，深灰背景，自信微笑，西装质感清晰，高级灰调" },
            { title: "复古胶片少女", prompt: "复古胶片风格少女半身像，柯达 Gold 200 色调，午后窗边自然光，轻微颗粒感" },
            { title: "赛博朋克角色", prompt: "赛博朋克风格角色立绘，霓虹紫蓝光，义体细节，雨夜街头背景，高对比" },
        ],
    },
    {
        tag: "风景",
        items: [
            { title: "层峦叠嶂", prompt: "航拍视角层峦叠嶂的山水，晨雾缭绕，金色日出，中国水墨意境，超广角" },
            { title: "极光雪原", prompt: "极光下的雪原木屋，星空银河，冷暖对比，超现实主义，宏大构图" },
            { title: "江南烟雨", prompt: "江南水乡烟雨朦胧，乌篷船，青石桥，水墨丹青风格，留白构图" },
        ],
    },
    {
        tag: "电商",
        items: [
            { title: "产品悬浮图", prompt: "电商主图，产品悬浮居中，柔和渐变背景，光斑点缀，商业级打光，超清细节" },
            { title: "场景种草图", prompt: "产品自然场景使用图，温暖生活化布景，浅景深突出产品，治愈系色调" },
            { title: "节日促销图", prompt: "节日大促主图，礼盒与产品组合，红色喜庆氛围，光效粒子，电商横版构图" },
        ],
    },
    {
        tag: "海报/Logo",
        items: [
            { title: "极简海报", prompt: "极简主义海报设计，大留白，单主体居中，高级配色，衬线字体排版感" },
            { title: "国潮插画", prompt: "国潮风格插画海报，传统纹样与现代表达结合，浓郁中国色，对称构图" },
            { title: "几何 Logo", prompt: "几何抽象 Logo 设计，负空间巧思，黑白双色，矢量扁平风格" },
        ],
    },
    {
        tag: "分镜",
        items: [
            { title: "四格分镜", prompt: "四宫格分镜脚本：同一角色在四个连续场景中的动作演变，画风统一，电影构图" },
            { title: "九宫格分镜", prompt: "九宫格故事板，镜头语言丰富（远全中近特），连续叙事，黑白线稿风格" },
            { title: "角色设定表", prompt: "角色三视图设定表（正面/侧面/背面）+ 表情包六宫格，设定统一，白底展示图" },
        ],
    },
];

type PersonalTemplate = { id: string; name: string; savedAt: number; snapshot: { nodes: CanvasNodeData[]; connections: Array<{ fromNodeId: string; toNodeId: string }> } };

const TEMPLATE_KEY = "anygen:canvas:workflow_templates";

function loadTemplates(): PersonalTemplate[] {
    try {
        return (JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? "[]") as PersonalTemplate[]).filter((item) => item?.snapshot?.nodes);
    } catch {
        return [];
    }
}

export function CanvasWorkbench({ open, layout, onLayoutChange, onClose, imageModelsCount, onInsertImageNode, onRetryTask, onUsePrompt, onInstantiateWorkflow, getGraphSnapshot, onInstantiateTemplate }: WorkbenchProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [tab, setTab] = useState<"history" | "prompts" | "workflow">("history");
    const [filter, setFilter] = useState<"all" | "image" | "video">("all");
    const [search, setSearch] = useState("");
    const [workflowPrompt, setWorkflowPrompt] = useState("");
    const [templateName, setTemplateName] = useState("");
    const [templates, setTemplates] = useState<PersonalTemplate[]>(() => loadTemplates());
    const remotePrompts = useQuery({
        queryKey: ["canvas-remote-prompts"],
        queryFn: () => fetchRemotePrompts(),
        staleTime: 60 * 60 * 1000,
        enabled: open && tab === "prompts",
    });
    // 提示词中心导入库（public/data/prompt-library.json，1593 条；前 300 条进工作台检索）
    const library = useQuery({
        queryKey: ["prompt-library"],
        queryFn: async () => {
            const res = await fetch("/data/prompt-library.json");
            if (!res.ok) throw new Error("提示词库加载失败");
            return (await res.json()) as { prompts: Array<{ title: string; prompt: string; tags?: string[] }> };
        },
        staleTime: Infinity,
        enabled: open && tab === "prompts",
    });

    const tasks = useQuery({
        queryKey: ["canvas-workbench-tasks"],
        queryFn: async () => {
            const list = await api<GenTask[]>("/generation/tasks");
            const hasRunning = list.some((task) => task.status === "queued" || task.status === "running");
            if (hasRunning) {
                await Promise.all(list.filter((task) => task.status === "running").map((task) => api(`/generation/tasks/${task.id}`).catch(() => null)));
                return api<GenTask[]>("/generation/tasks");
            }
            return list;
        },
        refetchInterval: (query) => (query.state.data?.some((task) => task.status === "queued" || task.status === "running") ? 4000 : false),
        enabled: open,
    });
    const assets = useQuery({
        queryKey: ["canvas-workbench-assets"],
        queryFn: () => api<AssetRow[]>("/assets"),
        enabled: open,
    });
    const skills = useQuery({
        queryKey: ["agent-skills"],
        queryFn: () => api<Array<AgentSkill & { step_count: number; plan_template?: { steps?: WorkflowStep[] } }>>("/agent/skills"),
        enabled: open && tab === "workflow",
    });

    const assetById = useMemo(() => new Map((assets.data ?? []).map((asset) => [asset.id, asset])), [assets.data]);
    const filteredTasks = useMemo(() => (tasks.data ?? []).filter((task) => (filter === "all" ? true : task.type === filter)).slice(0, 30), [tasks.data, filter]);
    const promptHits = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        const builtin = PROMPT_LIBRARY.flatMap((group) => group.items.map((item) => ({ ...item, tag: group.tag })));
        const remote = (remotePrompts.data ?? []).map((item: RemotePrompt) => ({ title: item.title, prompt: item.prompt, tag: `${item.tag} · 远程` }));
        const imported = (library.data?.prompts ?? []).slice(0, 300).map((item) => ({ title: item.title, prompt: item.prompt, tag: item.tags?.[0] ?? "导入库" }));
        return [...imported, ...builtin, ...remote].filter((item) => !keyword || `${item.title} ${item.prompt} ${item.tag}`.toLowerCase().includes(keyword));
    }, [search, remotePrompts.data]);

    if (!open) return null;

    const containerClass =
        layout === "side"
            ? "flex h-full w-[360px] shrink-0 flex-col border-l"
            : "absolute inset-x-3 bottom-[76px] z-[60] flex h-[280px] flex-col rounded-xl border shadow-2xl";

    return (
        <aside className={containerClass} style={{ background: theme.node.panel, borderColor: theme.node.stroke }} data-canvas-no-zoom>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: theme.node.stroke }}>
                <div className="grid grid-cols-3 gap-1 rounded-lg p-0.5" style={{ background: theme.node.fill }}>
                    {([
                        { key: "history", label: "生成记录", icon: <LayoutGrid className="size-3.5" /> },
                        { key: "prompts", label: "提示词库", icon: <Lightbulb className="size-3.5" /> },
                        { key: "workflow", label: "工作流", icon: <WandSparkles className="size-3.5" /> },
                    ] as const).map((item) => (
                        <button key={item.key} type="button" className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs transition" style={tab === item.key ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }} onClick={() => setTab(item.key)}>
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </div>
                <div className="flex-1" />
                <button type="button" title={layout === "side" ? "切换为底部布局" : "切换为侧边布局"} onClick={() => onLayoutChange(layout === "side" ? "bottom" : "side")} className="flex size-8 items-center justify-center rounded-md transition hover:opacity-75" style={{ color: theme.node.muted }}>
                    <Grid2x2 className="size-4" />
                </button>
                <button type="button" title="收起工作台" onClick={onClose} className="flex size-8 items-center justify-center rounded-md text-sm transition hover:opacity-75" style={{ color: theme.node.muted }}>
                    ✕
                </button>
            </header>

            {tab === "history" ? (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex items-center gap-2 px-3 py-2">
                        {(["all", "image", "video"] as const).map((option) => (
                            <button key={option} type="button" className="h-7 rounded-full px-3 text-[11px] transition" style={filter === option ? { background: "#2f80ff", color: "#fff" } : { background: theme.node.fill, color: theme.node.muted }} onClick={() => setFilter(option)}>
                                {option === "all" ? "全部" : option === "image" ? "图片" : "视频"}
                            </button>
                        ))}
                        <span className="ml-auto text-[10px] opacity-50">{filteredTasks.length} 条</span>
                    </div>
                    <div className="thin-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
                        {tasks.isLoading ? <div className="py-8 text-center text-xs opacity-50">加载中…</div> : null}
                        {!tasks.isLoading && !filteredTasks.length ? <div className="py-8 text-center text-xs opacity-50">暂无生成记录</div> : null}
                        {filteredTasks.map((task) => (
                            <div key={task.id} className="rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel }}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-xs font-medium" style={{ color: theme.node.text }}>{task.prompt || "（无提示词）"}</div>
                                        <div className="mt-1 flex items-center gap-2 text-[10px]" style={{ color: theme.node.muted }}>
                                            <span>{task.type === "image" ? "图片" : task.type === "video" ? "视频" : task.type}</span>
                                            <span>{task.model_code.split("/").pop()}</span>
                                            {task.cost_cents ? <span>{formatUsd(task.cost_cents)}</span> : null}
                                            <span>{task.status === "succeeded" ? "✓ 完成" : task.status === "failed" ? "✕ 失败" : task.status === "running" ? "生成中" : "排队中"}</span>
                                        </div>
                                    </div>
                                    {task.status === "failed" ? (
                                        <button type="button" title="原参数重试" className="flex size-7 shrink-0 items-center justify-center rounded-md transition hover:opacity-75" style={{ color: "#2f80ff" }} onClick={() => onRetryTask(task)}>
                                            <RefreshCw className="size-3.5" />
                                        </button>
                                    ) : null}
                                </div>
                                {task.status === "failed" && task.error ? (
                                    <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-red-400/40 bg-red-400/10 p-2 text-[10px] leading-4 text-red-300">
                                        <AlertCircle className="mt-0.5 size-3 shrink-0" />
                                        {task.error}
                                    </div>
                                ) : null}
                                {task.status === "succeeded" && task.outputs?.length ? (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {task.outputs.map((assetId) => {
                                            const asset = assetById.get(assetId);
                                            if (!asset) return null;
                                            return (
                                                <button
                                                    key={assetId}
                                                    type="button"
                                                    title="插入画布"
                                                    className="group relative size-16 overflow-hidden rounded-lg border"
                                                    style={{ borderColor: theme.node.stroke }}
                                                    onClick={() => onInsertImageNode(asset.url, asset, asset.kind === "video" ? "生成视频" : "生成图片")}
                                                >
                                                    {asset.kind === "video" ? (
                                                        <video src={asset.url} className="h-full w-full object-cover" muted preload="metadata" />
                                                    ) : (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={asset.url} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                                                    )}
                                                    <span className="absolute inset-0 hidden place-items-center bg-black/50 text-[10px] text-white group-hover:grid">插入画布</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}
                                {task.status === "running" || task.status === "queued" ? <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: theme.node.stroke }}><div className="h-full w-1/3 animate-pulse rounded-full" style={{ background: "#2f80ff" }} /></div> : null}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {tab === "prompts" ? (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="px-3 py-2">
                        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索提示词（标题/内容/标签）" className="h-9 w-full rounded-lg border px-3 text-xs outline-none" style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }} />
                    </div>
                    <div className="thin-scrollbar min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
                        {promptHits.map((item) => (
                            <button key={item.title} type="button" className="block w-full rounded-xl border p-2.5 text-left transition hover:opacity-80" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel }} onClick={() => onUsePrompt(item.prompt)}>
                                <div className="flex items-center gap-2">
                                    <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: theme.node.fill, color: theme.node.muted }}>{item.tag}</span>
                                    <span className="text-xs font-medium" style={{ color: theme.node.text }}>{item.title}</span>
                                </div>
                                <div className="mt-1.5 line-clamp-2 text-[11px] leading-4 opacity-65" style={{ color: theme.node.text }}>{item.prompt}</div>
                            </button>
                        ))}
                        {!promptHits.length ? <div className="py-8 text-center text-xs opacity-50">无匹配提示词</div> : null}
                        <div className="pt-1 text-center text-[10px] opacity-40">{library.isFetching ? "提示词库加载中…" : library.data?.prompts?.length ? `导入库 ${library.data.prompts.length} 条（提示词中心全量）` : "导入库不可用，展示内置精选集"}</div>
                    </div>
                </div>
            ) : null}

            {tab === "workflow" ? (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="px-3 py-2">
                        <textarea value={workflowPrompt} onChange={(event) => setWorkflowPrompt(event.target.value)} placeholder="创作目标（将替换模板中的 {prompt} 变量）" className="thin-scrollbar max-h-24 min-h-16 w-full resize-none rounded-lg border p-2 text-xs outline-none" style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }} />
                    </div>
                    <div className="thin-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
                        {skills.isLoading ? <div className="py-8 text-center text-xs opacity-50">加载技能模板…</div> : null}
                        {(skills.data ?? []).map((skill) => (
                            <div key={skill.id} className="rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel }}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="text-xs font-medium" style={{ color: theme.node.text }}>{skill.title}</div>
                                        <div className="mt-1 line-clamp-2 text-[11px] opacity-65" style={{ color: theme.node.text }}>{skill.description}</div>
                                        <div className="mt-1 text-[10px] opacity-50">{skill.step_count} 步模板</div>
                                    </div>
                                    <button type="button" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-3 text-[11px] font-medium text-white transition hover:opacity-90" style={{ background: "#2f80ff" }} onClick={() => {
                                        if (!workflowPrompt.trim()) {
                                            toast.error("请先填写创作目标");
                                            return;
                                        }
                                        onInstantiateWorkflow(skill, workflowPrompt.trim());
                                    }}>
                                        <Sparkles className="size-3.5" />
                                        实例化
                                    </button>
                                </div>
                            </div>
                        ))}
                        <div className="rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel }}>
                            <div className="text-xs font-medium" style={{ color: theme.node.text }}>个人模板（当前画布存为可复用工作流）</div>
                            <div className="mt-2 flex gap-1.5">
                                <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="模板名称" className="h-8 min-w-0 flex-1 rounded-lg border px-2 text-[11px] outline-none" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }} />
                                <button type="button" className="h-8 shrink-0 rounded-lg px-3 text-[11px] font-medium text-white transition hover:opacity-90" style={{ background: "#2f80ff" }} onClick={() => {
                                    const name = templateName.trim();
                                    if (!name) {
                                        toast.error("请填写模板名称");
                                        return;
                                    }
                                    const snapshot = getGraphSnapshot();
                                    if (!snapshot.nodes.length) {
                                        toast.error("当前画布为空");
                                        return;
                                    }
                                    const next = [{ id: `tpl-${Date.now().toString(36)}`, name, savedAt: Date.now(), snapshot }, ...templates].slice(0, 20);
                                    setTemplates(next);
                                    try {
                                        localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
                                        setTemplateName("");
                                        toast.success(`已保存模板「${name}」`);
                                    } catch {
                                        toast.error("模板保存失败（存储不可用）");
                                    }
                                }}>
                                    保存当前画布
                                </button>
                            </div>
                            {templates.length ? (
                                <div className="mt-2 space-y-1.5">
                                    {templates.map((template) => (
                                        <div key={template.id} className="flex items-center gap-2 rounded-lg border px-2 py-1.5" style={{ borderColor: theme.node.stroke }}>
                                            <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: theme.node.text }}>{template.name}</span>
                                            <span className="shrink-0 text-[10px] opacity-50">{template.snapshot.nodes.length} 节点</span>
                                            <button type="button" className="shrink-0 rounded-md px-2 py-1 text-[10px] text-white" style={{ background: "#2f80ff" }} onClick={() => onInstantiateTemplate(template.snapshot)}>
                                                实例化
                                            </button>
                                            <button type="button" title="删除模板" className="shrink-0 rounded-md px-1.5 py-1 text-[10px]" style={{ color: "#f87171" }} onClick={() => {
                                                const next = templates.filter((item) => item.id !== template.id);
                                                setTemplates(next);
                                                localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
                                            }}>
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                        <div className="rounded-xl border border-dashed p-2.5 text-[11px] leading-4 opacity-60" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                            需要自定义工作流？直接在右侧「对话」里对 Agent 描述，它会用 workflow 技能为你创建节点图。
                        </div>
                    </div>
                </div>
            ) : null}
        </aside>
    );
}

/** 工作流实例化：技能 plan_template steps → 画布节点图（文本说明 + 生成配置链） */
export function buildWorkflowNodes(skill: { title: string; steps?: WorkflowStep[]; plan_template?: { steps?: WorkflowStep[] } }, userPrompt: string, origin: Position): { nodes: CanvasNodeData[]; connections: Array<{ fromNodeId: string; toNodeId: string }> } {
    const steps = (skill.steps?.length ? skill.steps : skill.plan_template?.steps) ?? [];
    const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const nodes: CanvasNodeData[] = [];
    const connections: Array<{ fromNodeId: string; toNodeId: string }> = [];
    const head: CanvasNodeData = { id: uid("text"), type: CanvasNodeType.Text, title: `${skill.title} · 目标`, position: origin, width: 340, height: 240, metadata: { content: userPrompt, status: "idle", fontSize: 14 } };
    nodes.push(head);
    let previousId = head.id;
    steps.slice(0, 8).forEach((step, index) => {
        const prompt = (step.prompt ?? step.title ?? "").replace(/\{prompt\}/g, userPrompt);
        const config: CanvasNodeData = { id: uid("config"), type: CanvasNodeType.Config, title: step.title || `步骤 ${index + 1}`, position: { x: origin.x + (index + 1) * 520, y: origin.y }, width: 440, height: 240, metadata: { generationMode: step.type === "video" ? "video" : "image", composerContent: prompt, status: "idle" } };
        nodes.push(config);
        connections.push({ fromNodeId: previousId, toNodeId: config.id });
        previousId = config.id;
    });
    return { nodes, connections };
}
