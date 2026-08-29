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

export const generationTypeSchema = z.enum(["image", "video"]);
export type GenerationType = z.infer<typeof generationTypeSchema>;

export const canvasNodeData = z.discriminatedUnion("type", [
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
export type CanvasNodeData = z.infer<typeof canvasNodeData>;

const canvasGraphBase = z.object({
  nodes: z.array(
    z.object({
      id: z.string().min(1).max(64),
      type: z.string().max(32),
      position: z.object({ x: z.number(), y: z.number() }),
      data: z.unknown(),
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
    .object({ x: z.number(), y: z.number(), zoom: z.number().min(0.05).max(4) })
    .optional(),
});

/** graph 整体校验：节点 data 必须与 type 匹配，edge 不得悬挂 */
export const canvasGraphSchema = canvasGraphBase.superRefine((graph, ctx) => {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  for (const node of graph.nodes) {
    const data = canvasNodeData.safeParse({ ...(node.data as Record<string, unknown>), type: node.type });
    if (!data.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes"], message: `node ${node.id}: invalid data for type ${node.type}` });
    }
  }
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

export const CREDIT_REASONS = ["signup_bonus", "generation_consume", "generation_refund", "topup"] as const;
export const creditReasonSchema = z.enum(CREDIT_REASONS);
export type CreditReason = (typeof CREDIT_REASONS)[number];

export const DREAMINA = "dreamina" as const;
