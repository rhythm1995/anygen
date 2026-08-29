"use client";

import { supabase } from "./supabase";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001/api";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  console.log("[api] call", path);
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    ...(await authHeaders()),
  };
  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { message?: string }).message ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

// ---------- 类型（对齐 API 返回） ----------

export interface FeedItem {
  id: string;
  title: string;
  coverUrl: string;
  width: number;
  height: number;
  authorName: string;
  authorAvatar: string;
  modelReqKey: string;
  generateType: string;
}
export interface FeedPage {
  items: FeedItem[];
  hasMore: boolean;
  nextOffset: number;
}
export interface MeInfo {
  id: string;
  name: string;
  avatarUrl: string;
  role: string;
  balance_cents: number;
}
export interface Project {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  graph_version: number;
  created_at: string;
  updated_at: string;
}
export interface ProjectDetail extends Project {
  graph: { nodes: CanvasNode[]; edges: CanvasEdge[]; viewport?: { x: number; y: number; zoom: number } };
}
export interface CanvasNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}
export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
}
export interface Chat {
  id: string;
  title: string;
  updated_at: string;
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  task_ids: string[];
  created_at: string;
}
export interface GenTask {
  id: string;
  type: string;
  prompt: string;
  params: Record<string, unknown>;
  model_code: string;
  status: "queued" | "running" | "succeeded" | "failed";
  error: string | null;
  cost_cents: number;
  outputs: string[];
  createdAt: string;
}
export interface AssetRow {
  id: string;
  kind: string;
  storageKey: string;
  url: string;
  mime: string;
  width: number | null;
  height: number | null;
  meta: Record<string, unknown>;
  createdAt: string;
}
export interface AgentModel {
  model_req_key: string;
  model_name: string;
  kind: string;
  is_default: boolean;
}
export interface AgentSkill {
  id: string;
  name: string;
  title: string;
  description: string;
}

// ---------- CN 创作模式（对齐 /api/config/creation-types） ----------

export const CREATION_TYPES = [
  "agent", "image", "video", "music", "dubbing", "digital_human", "motion_mimic",
] as const;
export type CreationType = (typeof CREATION_TYPES)[number];

export interface CreationMode {
  key: CreationType;
  label: string;
  icon: string;
  enabled: boolean;
  sort: number;
}

export interface ModelEntry {
  creation_type: CreationType;
  code: string;
  display_name: string;
  description: string;
  badge: string | null;
  unit_type: "per_image" | "per_second" | "per_token" | "per_request";
  price_cents: number;
  params: {
    kind?: string;
    aspect_ratio?: { options: string[]; default: string };
    resolution?: { options: string[]; default: string };
    resolution_factors?: Record<string, number>;
    resolutions?: Record<string, { factor: number; name?: string; map?: { name: string; sizes: { ratio_type: number; width: number; height: number }[] } | null }>;
    generate_count_options?: number[];
    default_generate_count?: number;
    duration_ms?: { min_duration_ms: number; max_duration_ms: number };
    duration?: string;
    input_media_type?: { options: string[]; default: string };
    styles?: string[];
    voice_clone?: boolean;
  };
  is_default: boolean;
  provider: string;
}

export interface CreationTypesConfig {
  modes: CreationMode[];
  models: ModelEntry[];
  modelsByType: Partial<Record<CreationType, ModelEntry[]>>;
}

export const formatUsd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
