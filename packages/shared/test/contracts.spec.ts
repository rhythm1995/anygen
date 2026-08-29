import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  feedPageSchema,
  agentConfigSchema,
  userInfoSchema,
  userCreditSchema,
  projectListSchema,
  feedItemSchema,
  feedItem,
  generationTaskStatusSchema,
  canvasGraphSchema,
} from "../src/index";

const fixture = <T = unknown>(name: string): T =>
  JSON.parse(readFileSync(path.join(fileURLToPath(new URL(".", import.meta.url)), "fixtures", `${name}.json`), "utf8"));

describe("feed contract（真实 fixture round-trip）", () => {
  const raw = fixture("feed");

  it("解析完整 feed 响应", () => {
    const page = feedPageSchema.parse(raw);
    expect(page.items.length).toBeGreaterThan(0);
    expect(typeof page.hasMore).toBe("boolean");
  });

  it("feed item 关键字段与原站值一致", () => {
    const page = feedPageSchema.parse(raw);
    const first = raw.data.item_list[0];
    const item = page.items[0];
    expect(item.id).toBe(String(first.common_attr.id));
    expect(item.coverUrl).toBeTruthy();
    expect(item.width).toBeGreaterThan(0);
    expect(item.height).toBeGreaterThan(0);
  });

  it("缺 title 容错为空串；缺 author 容错", () => {
    const partial = {
      data: {
        has_more: false,
        next_offset: 0,
        item_list: [{ common_attr: { id: 123, cover_url: "https://x/y.jpg" } }],
      },
    };
    const page = feedPageSchema.parse(partial);
    expect(page.items[0].title).toBe("");
    expect(page.items[0].authorName).toBe("");
  });

  it("缺 id 报 ZodError 且 path 指向 id", () => {
    const bad = { data: { has_more: false, item_list: [{ common_attr: { cover_url: "x" } }] } };
    const result = feedItemSchema.safeParse(bad.data.item_list[0]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path.join(".")).toContain("id");
    }
  });

  it("generate_type 按结构推断（有 text2video_params → text2video）", () => {
    const videoItem = {
      common_attr: { id: "v1", cover_url: "https://x/v.jpg" },
      aigc_image_params: {
        generate_type: 4,
        text2video_params: { model_config: { model_req_key: "seedance" } },
      },
    };
    expect(feedItem.parse(videoItem).generateType).toBe("text2video");
  });
});

describe("agent config contract", () => {
  const raw = fixture("agent-config");

  it("解析 model_list 与 skill_data", () => {
    const cfg = agentConfigSchema.parse(raw);
    expect(cfg.imageModels.length).toBeGreaterThan(0);
    expect(cfg.skills.length).toBeGreaterThan(0);
    const skill = cfg.skills[0];
    expect(typeof skill.id).toBe("string");
    expect(skill.name.length).toBeGreaterThan(0);
  });

  it("默认模型索引合法（指向存在的模型）", () => {
    const cfg = agentConfigSchema.parse(raw);
    expect(cfg.imageDefaultIndex).toBeLessThan(cfg.imageModels.length);
  });

  it("unknown 字段被 strip 不报错（原站响应含大量冗余键）", () => {
    const cfg = agentConfigSchema.parse(raw);
    expect(JSON.stringify(cfg)).not.toContain("starling_mapping");
  });
});

describe("user info / credit contracts", () => {
  it("user info round-trip", () => {
    const raw = fixture("user-info");
    const info = userInfoSchema.parse(raw);
    expect(info.uid).toBeTruthy();
    expect(typeof info.name).toBe("string");
  });

  it("credit 结构（vip/gift/purchase）", () => {
    const raw = fixture("user-credit");
    const credit = userCreditSchema.parse(raw);
    expect(credit.vipCredit).toBeGreaterThanOrEqual(0);
    expect(credit.total).toBe(credit.vipCredit + credit.giftCredit + credit.purchaseCredit);
  });
});

describe("project list contract", () => {
  it("解析（捕获时为空列表 + cursor）", () => {
    const raw = fixture("list-project");
    const page = projectListSchema.parse(raw);
    expect(Array.isArray(page.projects)).toBe(true);
    expect(typeof page.hasMore).toBe("boolean");
  });
});

describe("本项目的生成契约（不来自原站）", () => {
  it("任务状态机枚举", () => {
    expect(() => generationTaskStatusSchema.parse("queued")).not.toThrow();
    expect(() => generationTaskStatusSchema.parse("running")).not.toThrow();
    expect(() => generationTaskStatusSchema.parse("succeeded")).not.toThrow();
    expect(() => generationTaskStatusSchema.parse("failed")).not.toThrow();
    expect(generationTaskStatusSchema.safeParse("done").success).toBe(false);
  });

  it("canvas graph 校验：合法节点图通过", () => {
    const graph = {
      nodes: [
        { id: "n1", type: "image", position: { x: 0, y: 0 }, data: { url: "/seed/feed/a.jpg", width: 640, height: 640 } },
        { id: "n2", type: "text", position: { x: 100, y: 100 }, data: { text: "hello" } },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    expect(canvasGraphSchema.parse(graph)).toBeTruthy();
  });

  it("canvas graph 拒绝非法节点类型", () => {
    const graph = {
      nodes: [{ id: "n1", type: "hacker", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    };
    expect(canvasGraphSchema.safeParse(graph).success).toBe(false);
  });
});
