import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  creationTypeSchema,
  creationModeSchema,
  creationModesConfigSchema,
  cnModelConfigSchema,
  pricing,
  taskParamsSchema,
} from "../src/index";

const dir = fileURLToPath(new URL(".", import.meta.url));
const fixture = (name: string) => JSON.parse(readFileSync(path.join(dir, "fixtures", `${name}.json`), "utf8"));

describe("CN 创作类型契约", () => {
  it("7 种创作类型枚举", () => {
    const all = ["agent", "image", "video", "music", "dubbing", "digital_human", "motion_mimic"];
    for (const t of all) expect(creationTypeSchema.parse(t)).toBe(t);
    expect(creationTypeSchema.safeParse("hacker").success).toBe(false);
  });

  it("creation_modes 表行 → 面板配置", () => {
    const row = { key: "image", label: "图片生成", icon: "image", enabled: true, sort: 2 };
    expect(creationModeSchema.parse(row)).toMatchObject({ key: "image", label: "图片生成" });
  });

  it("creation-types 聚合响应（modes + models 分组）", () => {
    const payload = {
      modes: [
        { key: "agent", label: "Agent 模式", icon: "agent", enabled: true, sort: 1 },
        { key: "image", label: "图片生成", icon: "image", enabled: true, sort: 2 },
      ],
      models: [
        { creation_type: "image", code: "high_aes_general_v50p_large", display_name: "图片 5.0 Pro", description: "…", badge: "New", unit_type: "per_image", price_cents: 8, params: {}, is_default: true },
      ],
    };
    const cfg = creationModesConfigSchema.parse(payload);
    expect(cfg.modes).toHaveLength(2);
    expect(cfg.modelsByType.image).toHaveLength(1);
    expect(cfg.modelsByType.agent).toEqual([]);
  });
});

describe("CN 图片/视频模型配置契约（真实 SSR fixtures）", () => {
  it("图片 9 模型 + 分辨率/数量矩阵", () => {
    const raw = fixture("cn-image-config");
    const cfg = cnModelConfigSchema.parse(raw);
    expect(cfg.models).toHaveLength(9);
    expect(cfg.models[0].reqKey).toBe("high_aes_general_v50p_large");
    expect(cfg.models[0].name).toBe("图片 5.0 Pro");
    expect(cfg.defaultIndex).toBeLessThan(cfg.models.length);
    const withMap = cfg.models.find((m) => m.resolutionMap && Object.keys(m.resolutionMap).length > 0);
    expect(withMap).toBeTruthy();
    const map2k = withMap!.resolutionMap!["2k"];
    expect(map2k.name).toBe("高清 2K");
    expect(map2k.sizes.length).toBe(8);
    expect(cfg.models[0].generateCountOptions).toContain(2);
  });

  it("视频 11 模型 + 比例/分辨率/时长", () => {
    const raw = fixture("cn-video-config");
    const cfg = cnModelConfigSchema.parse(raw);
    expect(cfg.models).toHaveLength(11);
    expect(cfg.models[0].reqKey).toBe("dreamina_seedance_45_pro");
    const m = cfg.models[0];
    const ar = m.enums.video_aspect_ratio;
    expect(ar?.options).toContain("16:9");
    expect(m.enums.resolution?.options).toContain("1080p");
    expect(cfg.durationRange).toEqual({ min_duration_ms: 4000, max_duration_ms: 15000 });
    const mini = cfg.models.find((x) => x.name.includes("mini"));
    expect(mini!.enums.resolution?.options).toEqual(["720p"]);
  });
});

describe("定价计算器（美分）", () => {
  const imageModel = { unit_type: "per_image" as const, price_cents: 5, resolution_factor: { "1.5k": 1.0, "2k": 1.8, "4k": 3.2 } };
  const videoModel = { unit_type: "per_second" as const, price_cents: 14, resolution_factor: { "480p": 0.6, "720p": 1.0, "1080p": 2.4 } };
  const perReq = { unit_type: "per_request" as const, price_cents: 8, resolution_factor: {} };

  it("图片：价格 × 分辨率系数 × 张数，向上取整", () => {
    expect(pricing.costCents(imageModel, { resolution: "2k", count: 2 })).toBe(18); // 5×1.8×2=18
    expect(pricing.costCents(imageModel, { resolution: "1.5k", count: 1 })).toBe(5);
    expect(pricing.costCents(imageModel, { resolution: "4k", count: 4 })).toBe(64); // 5×3.2×4=64
  });

  it("视频：价格 × 秒 × 分辨率系数", () => {
    expect(pricing.costCents(videoModel, { resolution: "720p", duration_seconds: 5 })).toBe(70);
    expect(pricing.costCents(videoModel, { resolution: "1080p", duration_seconds: 5 })).toBe(168);
    expect(pricing.costCents(videoModel, { resolution: "480p", duration_seconds: 10 })).toBe(84);
  });

  it("per_request 固定费", () => {
    expect(pricing.costCents(perReq, {})).toBe(8);
  });

  it("非法分辨率/缺字段抛错（不允许静默 0 费）", () => {
    expect(() => pricing.costCents(imageModel, { resolution: "8k", count: 1 })).toThrow();
    expect(() => pricing.costCents(videoModel, { resolution: "720p" })).toThrow();
    expect(() => pricing.costCents({ unit_type: "per_token" as never, price_cents: 1, resolution_factor: {} }, {})).toThrow();
  });
});

describe("任务参数 schema（按类型）", () => {
  it("image 参数：ratio/resolution/count/custom_size", () => {
    const p = taskParamsSchema("image");
    expect(p.parse({ resolution: "2k", count: 2, ratio: "1:1" })).toBeTruthy();
    expect(p.safeParse({ resolution: "2k", count: 9 }).success).toBe(false);
  });

  it("video 参数：ratio/resolution/duration_seconds", () => {
    const p = taskParamsSchema("video");
    expect(p.parse({ resolution: "720p", duration_seconds: 5, ratio: "16:9" })).toBeTruthy();
    expect(p.safeParse({ resolution: "720p", duration_seconds: 60 }).success).toBe(false);
  });

  it("music/dubbing/digital_human/motion_mimic 各自参数", () => {
    expect(taskParamsSchema("music").parse({ duration_seconds: 30 })).toBeTruthy();
    expect(taskParamsSchema("dubbing").parse({ voice_id: "v1", text: "hello" })).toBeTruthy();
    expect(taskParamsSchema("digital_human").parse({ speech: "内容", motion: "镜头推进" })).toBeTruthy();
    expect(taskParamsSchema("motion_mimic").parse({ style: "生动" })).toBeTruthy();
  });
});
