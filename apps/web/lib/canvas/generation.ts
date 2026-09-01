/**
 * 画布生成服务层（D12 Phase B）
 * 替换 vendor/infinite-canvas 的 services/api/image|video（浏览器直连多渠道）：
 * 一律走本项目 POST /api/generation/tasks 计费管线（tryDebit/refund 幂等），模型清单来自 admin models 表。
 */
import { pricing } from "@dreamina/shared";

import { api, type CreationTypesConfig, type GenTask, type ModelEntry } from "@/lib/api";

export type CanvasGenerationKind = "image" | "video" | "music" | "dubbing";

export async function fetchCreationConfig(): Promise<CreationTypesConfig> {
  return api<CreationTypesConfig>("/config/creation-types");
}

export function modelsFor(config: CreationTypesConfig | undefined, kind: CanvasGenerationKind): ModelEntry[] {
  if (!config) return [];
  return (config.modelsByType[kind] ?? []).filter((model) => model.params !== undefined);
}

export function defaultModelFor(models: ModelEntry[]): ModelEntry | undefined {
  return models.find((model) => model.is_default) ?? models[0];
}

export function modelByCode(models: ModelEntry[], code?: string): ModelEntry | undefined {
  if (!code) return undefined;
  return models.find((model) => model.code === code);
}

/** ModelEntry.params → pricing.resolution_factor 表 */
export function resolutionFactorOf(model: ModelEntry): Record<string, number> {
  if (model.params.resolution_factors) return model.params.resolution_factors;
  const resolutions = model.params.resolutions ?? {};
  return Object.fromEntries(Object.entries(resolutions).map(([key, value]) => [key, value.factor]));
}

/** 预估费用（美分）；模型参数不全时返回 null（UI 显示 —，实扣以服务端为准） */
export function estimateCostCents(
  model: ModelEntry,
  p: { resolution?: string; count?: number; duration_seconds?: number },
): number | null {
  try {
    return pricing.costCents(
      { unit_type: model.unit_type, price_cents: model.price_cents, resolution_factor: resolutionFactorOf(model) },
      p,
    );
  } catch {
    return null;
  }
}

export interface CanvasTaskInput {
  type: CanvasGenerationKind;
  prompt: string;
  model_code: string;
  params: Record<string, unknown>;
}

export async function submitCanvasTask(input: CanvasTaskInput): Promise<GenTask> {
  return api<GenTask>("/generation/tasks", { method: "POST", body: input });
}

/** GET 即触发服务端向 provider 轮询（无独立 SSE） */
export async function pollCanvasTask(id: string): Promise<GenTask> {
  return api<GenTask>(`/generation/tasks/${id}`);
}
