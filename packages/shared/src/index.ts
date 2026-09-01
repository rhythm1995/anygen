// @dreamina/shared — zod contracts + types.
// 原站形状的证据: dreamina-clone/RECON/{network,auth/generate-api}/fixtures（docs/DATA-MODEL.md 对照表）。
import { z } from "zod";

// ---------- 原站形状（snake_case 输入 → camelCase 输出） ----------

const feedCommonAttr = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string().optional().default(""),
  cover_url: z.string(),
  cover_width: z.number().optional().default(0),
  cover_height: z.number().optional().default(0),
});

const feedAuthor = z
  .object({
    name: z.string().optional().default(""),
    avatar_url: z.string().optional().default(""),
  })
  .nullable()
  .optional();

const modelConfig = z
  .object({
    model_req_key: z.string().optional().default(""),
  })
  .passthrough();

export const feedItemSchema = z.object({
  common_attr: feedCommonAttr,
  author: feedAuthor,
  aigc_image_params: z
    .object({
      generate_type: z.unknown().optional(),
      text2image_params: z.object({ model_config: modelConfig }).partial().nullable().optional(),
      image2image_params: z.object({ model_config: modelConfig }).partial().nullable().optional(),
      text2video_params: z.object({ model_config: modelConfig }).partial().nullable().optional(),
    })
    .optional(),
});

export const feedItem = feedItemSchema.transform((raw) => {
  const c = raw.common_attr;
  const p = raw.aigc_image_params;
  const generateType = p?.text2video_params
    ? ("text2video" as const)
    : p?.image2image_params
      ? ("image2image" as const)
      : ("text2image" as const);
  const modelReqKey =
    p?.text2video_params?.model_config?.model_req_key ??
    p?.text2image_params?.model_config?.model_req_key ??
    p?.image2image_params?.model_config?.model_req_key ??
    "";
  return {
    id: c.id,
    title: c.title,
    coverUrl: c.cover_url,
    width: c.cover_width,
    height: c.cover_height,
    authorName: raw.author?.name ?? "",
    authorAvatar: raw.author?.avatar_url ?? "",
    modelReqKey,
    generateType,
  };
});
export type FeedItem = z.output<typeof feedItem>;

const feedItemInput = z.object({ item_list: z.array(z.unknown()) }).passthrough();

export const feedPageSchema = z
  .object({
    data: z.object({
      has_more: z.boolean(),
      next_offset: z.number().optional().default(0),
      item_list: z.array(z.unknown()),
    }),
  })
  .transform((raw) => ({
    items: raw.data.item_list.map((it) => feedItem.parse(it)),
    hasMore: raw.data.has_more,
    nextOffset: raw.data.next_offset,
  }));
export type FeedPage = ReturnType<typeof feedPageSchema.parse>;

export const agentModelSchema = z.object({
  model_req_key: z.string(),
  model_name: z.string().optional().default(""),
  model_tip: z.string().optional().default(""),
  icon_url: z.string().optional().default(""),
  is_new_model: z.boolean().optional().default(false),
});
export type AgentModel = z.infer<typeof agentModelSchema>;

export const agentSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  default_title: z.string().optional().default(""),
  default_desc: z.string().optional().default(""),
  market_enabled: z.boolean().optional().default(true),
});
export type AgentSkill = z.infer<typeof agentSkillSchema>;

export const agentConfigSchema = z
  .object({
    data: z
      .object({
        image_data: z
          .object({
            model_list: z.array(agentModelSchema),
            default_model_index: z.number().optional().default(0),
          })
          .passthrough()
          .optional(),
        video_data: z
          .object({
            model_list: z.array(agentModelSchema),
            default_model_idx: z.number().optional().default(0),
          })
          .passthrough()
          .optional(),
        skill_data: z.array(agentSkillSchema).optional().default([]),
      })
      .passthrough(),
  })
  .transform((raw) => {
    const d = raw.data;
    const imageModels = d.image_data?.model_list ?? [];
    const videoModels = d.video_data?.model_list ?? [];
    const imageDefaultIndex = Math.min(d.image_data?.default_model_index ?? 0, Math.max(imageModels.length - 1, 0));
    const videoDefaultIndex = Math.min(d.video_data?.default_model_idx ?? 0, Math.max(videoModels.length - 1, 0));
    return {
      imageModels,
      videoModels,
      imageDefaultIndex,
      videoDefaultIndex,
      skills: d.skill_data ?? [],
    };
  });
export type AgentConfig = ReturnType<typeof agentConfigSchema.parse>;

export const userInfoSchema = z
  .object({
    data: z
      .object({
        uid: z.union([z.string(), z.number()]).transform(String),
        name: z.string().optional().default(""),
        avatar_url: z.string().optional().default(""),
        description: z.string().optional().default(""),
      })
      .passthrough(),
  })
  .transform((raw) => raw.data);
export type UserInfo = z.infer<typeof userInfoSchema>;

export const userCreditSchema = z
  .object({
    data: z
      .object({
        credit: z.object({
          vip_credit: z.number().optional().default(0),
          gift_credit: z.number().optional().default(0),
          purchase_credit: z.number().optional().default(0),
        }),
      })
      .passthrough(),
  })
  .transform((raw) => {
    const c = raw.data.credit;
    return {
      vipCredit: c.vip_credit,
      giftCredit: c.gift_credit,
      purchaseCredit: c.purchase_credit,
      total: c.vip_credit + c.gift_credit + c.purchase_credit,
    };
  });
export type UserCredit = z.infer<typeof userCreditSchema>;

export const projectListSchema = z
  .object({
    data: z
      .object({
        projects: z.array(z.unknown()).optional().default([]),
        has_more: z.boolean().optional().default(false),
        next_cursor: z.number().optional().default(0),
      })
      .passthrough(),
  })
  .transform((raw) => ({
    projects: raw.data.projects,
    hasMore: raw.data.has_more,
    nextCursor: raw.data.next_cursor,
  }));
export type ProjectListPage = z.infer<typeof projectListSchema>;

// ---------- 本项目自有契约 ----------

export const generationTaskStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);
export type GenerationTaskStatus = z.infer<typeof generationTaskStatusSchema>;

export const generationTypeSchema = z.enum(["image", "video", "music", "dubbing", "digital_human", "motion_mimic"]);
export type GenerationType = z.infer<typeof generationTypeSchema>;

// ---- D12 画布 v2：节点模型对齐 vendor/infinite-canvas（tigerowo）CanvasNodeMetadata ----
export const canvasNodeTypeSchema = z.enum([
  "image", "text", "generation", "video", "audio", "config", "panorama", "director", "group",
]);
export type CanvasNodeTypeV2 = z.infer<typeof canvasNodeTypeSchema>;
export const canvasNodeStatusSchema = z.enum(["idle", "success", "loading", "error"]);
export const canvasGenerationModeSchema = z.enum(["text", "image", "video", "audio"]);
export const canvasBackgroundModeSchema = z.enum(["dots", "lines", "blank"]);

/** v2 节点 data：扁平 metadata；未建模字段（cameraControl、panorama 系列、directorProject 等 Phase D）透传 */
export const canvasNodeMetadataSchema = z
  .object({
    content: z.string().optional(),
    prompt: z.string().max(8000).optional(),
    status: canvasNodeStatusSchema.optional(),
    errorDetails: z.string().max(2000).optional(),
    fontSize: z.number().optional(),
    generationMode: canvasGenerationModeSchema.optional(),
    model: z.string().max(120).optional(),
    size: z.string().max(40).optional(),
    quality: z.string().max(40).optional(),
    count: z.number().int().min(1).max(20).optional(),
    naturalWidth: z.number().optional(),
    naturalHeight: z.number().optional(),
    freeResize: z.boolean().optional(),
    isBatchRoot: z.boolean().optional(),
    batchRootId: z.string().max(64).optional(),
    batchChildIds: z.array(z.string().max(64)).optional(),
    primaryImageId: z.string().max(64).optional(),
    imageBatchExpanded: z.boolean().optional(),
    inputOrder: z.array(z.string().max(64)).optional(),
    assetId: z.string().max(64).optional(),
    mimeType: z.string().max(80).optional(),
    bytes: z.number().optional(),
    durationMs: z.number().optional(),
    startedAt: z.number().optional(),
    progress: z.number().optional(),
    taskId: z.string().max(64).optional(),
    groupId: z.string().max(64).optional(),
  })
  .passthrough();
export type CanvasNodeMetadataV2 = z.infer<typeof canvasNodeMetadataSchema>;

/** legacy 节点 data（xyflow 时代：image{url}/text{text}/generation{taskId,url}），仅作读取兼容 */
export const legacyCanvasNodeData = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("image"),
    url: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    assetId: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal("text"),
    text: z.string().max(5000),
  }),
  z.object({
    type: z.literal("generation"),
    taskId: z.string().uuid().optional(),
    prompt: z.string().max(4000).default(""),
    url: z.string().optional(),
  }),
]);
export type CanvasNodeData = z.infer<typeof legacyCanvasNodeData>;

/** 把 legacy 节点（url/text 载荷）归一化为 v2 metadata 节点；v2 节点原样返回 */
export function normalizeLegacyGraphNode<T extends { id: string; type: string; position: { x: number; y: number }; data?: Record<string, unknown> | null }>(node: T): T & { data: Record<string, unknown> } {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (node.type === "image" && typeof data.url === "string" && data.content === undefined) {
    const { url, width, height, ...rest } = data;
    return { ...node, data: { ...rest, content: url, naturalWidth: typeof width === "number" ? width : undefined, naturalHeight: typeof height === "number" ? height : undefined } };
  }
  if (node.type === "text" && typeof data.text === "string" && data.content === undefined) {
    const { text, ...rest } = data;
    return { ...node, data: { ...rest, content: text } };
  }
  if (node.type === "generation" && data.content === undefined && data.url !== undefined) {
    const { url, ...rest } = data;
    return { ...node, data: { ...rest, content: typeof url === "string" ? url : undefined } };
  }
  if (node.data === undefined || node.data === null) return { ...node, data: {} };
  return node as T & { data: Record<string, unknown> };
}

const canvasGraphBase = z.object({
  nodes: z.array(
    z.object({
      id: z.string().min(1).max(64),
      type: canvasNodeTypeSchema,
      position: z.object({ x: z.number(), y: z.number() }),
      data: canvasNodeMetadataSchema,
      title: z.string().max(120).optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string().min(1).max(96),
      source: z.string().min(1),
      target: z.string().min(1),
    }),
  ),
  viewport: z
    .object({ x: z.number(), y: z.number(), zoom: z.number().min(0.05).max(5) })
    .optional(),
  backgroundMode: canvasBackgroundModeSchema.optional(),
  showImageInfo: z.boolean().optional(),
  /** 画布 Agent 会话：graph 内嵌（tigerowo 同构）+ agent_sessions.project_id 双写（D12/D13） */
  chatSessions: z.array(z.unknown()).optional(),
  activeChatId: z.string().max(64).optional(),
});

/** graph 整体校验：edge 不得悬挂（data 为宽松 metadata，类型见 canvasNodeTypeSchema） */
export const canvasGraphSchema = canvasGraphBase.superRefine((graph, ctx) => {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edges"], message: `edge ${edge.id}: dangling endpoint` });
    }
  }
});
export type CanvasGraph = z.infer<typeof canvasGraphSchema>;

/** 校验 graph；返回可读错误（供 API 层映射 422） */
export function validateCanvasGraph(graph: unknown): { ok: true; value: CanvasGraph } | { ok: false; reason: string } {
  const parsed = canvasGraphSchema.safeParse(graph);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: issue ? `${issue.path.join(".")}: ${issue.message}` : "invalid graph" };
  }
  return { ok: true, value: parsed.data };
}

// ---------- 常量 ----------

export const ASSET_KINDS = ["image", "video", "audio", "doc", "element"] as const;
export const assetKindSchema = z.enum(ASSET_KINDS);
export type AssetKind = (typeof ASSET_KINDS)[number];

// ---------- 资产库契约（D8，2026-08-31，选项源 RECON/auth/asset 实测） ----------

export const ASSET_FILTER_RATIOS = ["21:9", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"] as const;
export const assetFilterRatioSchema = z.enum(ASSET_FILTER_RATIOS);
export type AssetFilterRatio = (typeof ASSET_FILTER_RATIOS)[number];

export const ASSET_FILTER_RESOLUTIONS = ["1K", "2K", "4K", "8K"] as const;
export const assetFilterResolutionSchema = z.enum(ASSET_FILTER_RESOLUTIONS);
export type AssetFilterResolution = (typeof ASSET_FILTER_RESOLUTIONS)[number];

export const ASSET_TIME_PRESETS = ["all", "week", "month", "quarter"] as const;
export const assetTimePresetSchema = z.enum(ASSET_TIME_PRESETS);
export type AssetTimePreset = (typeof ASSET_TIME_PRESETS)[number];

export const ASSET_SORT_ORDERS = ["desc", "asc"] as const;
export const assetSortSchema = z.enum(ASSET_SORT_ORDERS);

export const assetBatchActionSchema = z.enum(["delete", "favorite", "unfavorite", "publish"]);
export type AssetBatchAction = z.infer<typeof assetBatchActionSchema>;

export const assetBatchSchema = z.object({
  action: assetBatchActionSchema,
  ids: z.array(z.string().uuid()).min(1).max(200),
});
export type AssetBatchInput = z.infer<typeof assetBatchSchema>;

export const assetPatchSchema = z.object({
  favorited: z.boolean().optional(),
  published: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(20).optional(),
}).refine((v) => v.favorited !== undefined || v.published !== undefined || v.tags !== undefined, { message: "empty patch" });
export type AssetPatchInput = z.infer<typeof assetPatchSchema>;

export const CREDIT_REASONS = ["signup_bonus", "generation_consume", "generation_refund", "topup"] as const;
export const creditReasonSchema = z.enum(CREDIT_REASONS);
export type CreditReason = (typeof CREDIT_REASONS)[number];

export const DREAMINA = "dreamina" as const;

// ---------- CN 创作模式契约（2026-08-30，数据源 RECON/jimeng-cn SSR 配置） ----------

export const CREATION_TYPES = [
  "agent", "image", "video", "music", "dubbing", "digital_human", "motion_mimic",
] as const;
export const creationTypeSchema = z.enum(CREATION_TYPES);
export type CreationType = z.infer<typeof creationTypeSchema>;

export const creationModeSchema = z.object({
  key: z.string(),
  label: z.string(),
  icon: z.string().optional().default(""),
  enabled: z.boolean().optional().default(true),
  sort: z.number().optional().default(0),
});
export type CreationMode = z.infer<typeof creationModeSchema>;

const creationModeModelEntry = z.object({
  creation_type: z.string(),
  code: z.string(),
  display_name: z.string(),
  description: z.string().optional().default(""),
  badge: z.string().nullable().optional(),
  unit_type: z.string(),
  price_cents: z.number(),
  params: z.unknown().optional(),
  is_default: z.boolean().optional().default(false),
});
export type CreationModeModelEntry = z.output<typeof creationModeModelEntry>;
type ModelsByType = Record<string, CreationModeModelEntry[]>;

const creationModesConfigBase = z.object({
  modes: z.array(creationModeSchema),
  models: z.array(creationModeModelEntry),
});

export const creationModesConfigSchema = creationModesConfigBase.transform((raw): {
  modes: CreationMode[];
  models: CreationModeModelEntry[];
  modelsByType: ModelsByType;
} => {
  const modelsByType: ModelsByType = {};
  for (const mode of raw.modes) modelsByType[mode.key] = [];
  for (const m of raw.models) {
    (modelsByType[m.creation_type] ??= []).push(m);
  }
  for (const list of Object.values(modelsByType)) {
    list.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
  }
  return { modes: raw.modes, models: raw.models, modelsByType };
});
export type CreationModesConfig = z.output<typeof creationModesConfigSchema>;

const ratioSize = z.object({
  ratio_type: z.number(),
  width: z.number(),
  height: z.number(),
});

export const cnModelConfigSchema = z
  .object({
    data: z
      .object({
        model_list: z.array(
          z
            .object({
              model_req_key: z.string(),
              model_name: z.string(),
              model_tip: z.string().optional().default(""),
              is_new_model: z.boolean().optional(),
              icon_tag: z.string().optional(),
              resolution_map: z
                .record(
                  z.string(),
                  z.object({
                    resolution_name: z.string().optional().default(""),
                    image_ratio_sizes: z.array(ratioSize).optional().default([]),
                    image_range_config: z
                      .object({ min_length: z.number(), max_length: z.number(), max_pixel_num: z.number() })
                      .optional(),
                  })
                  .partial()
                  .optional(),
                )
                .optional(),
              generate_count_options: z.array(z.number()).optional(),
              default_generate_count: z.number().optional(),
              options: z.array(z.unknown()).optional(),
            })
            .passthrough(),
        ),
        default_model_index: z.number().optional().default(0),
        default_model_idx: z.number().optional().default(0),
        video_duration_display_range: z
          .object({ min_duration_ms: z.number(), max_duration_ms: z.number() })
          .optional(),
        video_resolution_display_list: z.array(z.object({ value: z.string(), text: z.string() })).optional(),
      })
      .passthrough(),
  })
  .transform((raw) => {
    const d = raw.data;
    const models = (d.model_list ?? []).map((m) => {
      const enums: Record<string, { options: (string | number)[]; default: string | number | null }> = {};
      for (const o of m.options ?? []) {
        const oo = o as { key?: string; value_type?: string; forbidden_display?: boolean; enum_val?: { string_value?: (string)[]; int_value?: number[]; default_val_idx?: number } };
        if (oo.value_type === "enum" && !oo.forbidden_display && oo.enum_val) {
          const options = oo.enum_val.string_value ?? oo.enum_val.int_value ?? [];
          if (options.length) {
            enums[oo.key ?? ""] = { options, default: options[oo.enum_val.default_val_idx ?? 0] ?? null };
          }
        }
      }
      const resolutionMap = m.resolution_map
        ? Object.fromEntries(
            Object.entries(m.resolution_map).map(([res, cfg]) => [
              res,
              {
                name: cfg?.resolution_name ?? res,
                sizes: cfg?.image_ratio_sizes ?? [],
                range: cfg?.image_range_config,
              },
            ]),
          )
        : undefined;
      return {
        reqKey: m.model_req_key,
        name: m.model_name,
        tip: m.model_tip,
        isNew: Boolean(m.is_new_model) || m.icon_tag === "new",
        resolutionMap,
        generateCountOptions: m.generate_count_options,
        enums,
      };
    });
    return {
      models,
      defaultIndex: Math.min(d.default_model_index ?? d.default_model_idx ?? 0, Math.max(models.length - 1, 0)),
      durationRange: d.video_duration_display_range ?? null,
      videoResolutions: d.video_resolution_display_list ?? null,
    };
  });
export type CnModelConfig = z.output<typeof cnModelConfigSchema>;

// ---------- 定价计算器（美分，永远向上取整） ----------

export interface PricingModel {
  unit_type: "per_image" | "per_second" | "per_token" | "per_request";
  price_cents: number;
  resolution_factor: Record<string, number>;
}

export const pricing = {
  /** 统一入口；缺参/非法分辨率抛错（不允许静默 0 费） */
  costCents(
    model: PricingModel,
    p: { resolution?: string; count?: number; duration_seconds?: number; tokens_in?: number; tokens_out?: number },
  ): number {
    const factor = (res?: string) => {
      if (!res) throw new Error(`pricing: resolution required for ${model.unit_type}`);
      // 空系数表 = 扁平定价模型（如 OpenRouter 按次计费），任意分辨率同价
      if (Object.keys(model.resolution_factor).length === 0) return 1;
      const f = model.resolution_factor[res];
      if (typeof f !== "number" || !(f > 0)) throw new Error(`pricing: unknown resolution ${res}`);
      return f;
    };
    switch (model.unit_type) {
      case "per_image": {
        const count = p.count ?? 1;
        if (count < 1) throw new Error("pricing: count must be >= 1");
        return Math.ceil(model.price_cents * factor(p.resolution) * count);
      }
      case "per_second": {
        const secs = p.duration_seconds;
        if (!secs || secs <= 0) throw new Error("pricing: duration_seconds required");
        // count：一次任务生成 N 条视频，按 N 条计费（原版生成数量 1-4）
        const count = p.count ?? 1;
        if (count < 1) throw new Error("pricing: count must be >= 1");
        return Math.ceil(model.price_cents * factor(p.resolution) * secs * count);
      }
      case "per_request":
        return model.price_cents;
      case "per_token": {
        const io = (model as PricingModel & { io_pricing?: { in_cents_per_m: number; out_cents_per_m: number } }).io_pricing;
        if (!io) throw new Error("pricing: per_token model requires io_pricing");
        if (!p.tokens_in && !p.tokens_out) throw new Error("pricing: token counts required");
        const inC = ((p.tokens_in ?? 0) / 1_000_000) * io.in_cents_per_m;
        const outC = ((p.tokens_out ?? 0) / 1_000_000) * io.out_cents_per_m;
        return Math.ceil(inC + outC);
      }
      default:
        throw new Error(`pricing: unknown unit_type`);
    }
  },
};

// ---------- 任务参数 schema（按创作类型） ----------

const IMAGE_RATIOS = ["1:1", "21:9", "16:9", "3:2", "4:3", "3:4", "2:3", "9:16"];
const VIDEO_RATIOS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];

const publicUrl = z.string().url().max(2000);

export const generationPreferenceSchema = z.object({
  auto: z.boolean().optional().default(true),
  image: z
    .object({
      ratio: z.string().max(16).optional(),
      model_code: z.string().max(120).optional(),
      resolution: z.string().max(16).optional(),
    })
    .optional(),
  video: z
    .object({
      ratio: z.string().max(16).optional(),
      model_code: z.string().max(120).optional(),
      resolution: z.string().max(16).optional(),
    })
    .optional(),
});
export type GenerationPreference = z.infer<typeof generationPreferenceSchema>;

export function taskParamsSchema(type: CreationType) {
  switch (type) {
    case "image":
      return z
        .object({
          resolution: z.string().min(1),
          ratio: z.enum(IMAGE_RATIOS as [string, ...string[]]).optional(),
          count: z.number().int().min(1).max(4).optional().default(2),
          custom_size: z
            .object({ width: z.number().int().min(512).max(8192), height: z.number().int().min(512).max(8192) })
            .optional(),
          /** 参考图：公网 URL；面板上限对齐原站 30，契约先放宽到 30（D9/D13） */
          input_images: z.array(publicUrl).max(30).optional(),
        })
        .passthrough();
    case "video":
      return z
        .object({
          resolution: z.enum(["480p", "720p", "1080p"]),
          ratio: z.enum(VIDEO_RATIOS as [string, ...string[]]).optional().default("16:9"),
          duration_seconds: z.number().int().min(3).max(180),
          count: z.number().int().min(1).max(4).optional().default(1),
          reference_mode: z
            .enum(["unified_edit", "first_end_frame", "smart_multi", "smart_edit", "long_video", "extend"])
            .optional(),
          input_images: z.array(publicUrl).max(30).optional(),
          input_videos: z.array(publicUrl).max(10).optional(),
          input_audios: z.array(publicUrl).max(10).optional(),
          first_frame_url: publicUrl.optional(),
          last_frame_url: publicUrl.optional(),
          reference_video_url: publicUrl.optional(),
        })
        .superRefine((v, ctx) => {
          // 普通/续写 4-15s；超长视频（long_video）模式 30-180s
          const max = v.reference_mode === "long_video" ? 180 : 15;
          const min = v.reference_mode === "long_video" ? 30 : 3;
          if (v.duration_seconds < min || v.duration_seconds > max) {
            ctx.addIssue({
              code: z.ZodIssueCode.too_small,
              type: "number",
              minimum: min,
              inclusive: true,
              path: ["duration_seconds"],
              message: `duration_seconds must be ${min}-${max}${v.reference_mode === "long_video" ? " (long_video)" : ""}`,
            });
          }
        });
    case "music":
      return z.object({ duration_seconds: z.number().int().min(5).max(300).optional(), style: z.string().max(120).optional() }).passthrough();
    case "dubbing":
      return z
        .object({
          voice_id: z.string().max(120).optional(),
          voice: z.string().max(120).optional(),
          text: z.string().max(5000).optional(),
          reference_audio: publicUrl.optional(),
          input_audios: z.array(publicUrl).max(4).optional(),
        })
        .passthrough();
    case "digital_human":
      return z
        .object({
          speech: z.string().max(5000).optional(),
          motion: z.string().max(2000).optional(),
          mode: z.string().max(40).optional(),
          input_images: z.array(publicUrl).max(4).optional(),
          input_audios: z.array(publicUrl).max(4).optional(),
        })
        .passthrough();
    case "motion_mimic":
      return z
        .object({
          style: z.string().max(60).optional(),
          reference_video: z.string().max(2000).optional(),
          reference_video_url: publicUrl.optional(),
          input_videos: z.array(publicUrl).max(4).optional(),
          input_images: z.array(publicUrl).max(4).optional(),
        })
        .passthrough();
    case "agent":
      return z.object({ skill_id: z.string().max(80).optional() }).passthrough();
  }
}

export type TaskParamsFor<T extends CreationType> = z.output<ReturnType<typeof taskParamsSchema>>;
