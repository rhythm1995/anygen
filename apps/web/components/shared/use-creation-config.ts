"use client";

import { useQuery } from "@tanstack/react-query";

import { api, type CreationTypesConfig } from "@/lib/api";

/** 创作面板配置（7 类型 + 模型清单）；creation-composer 与 video-composer 共享缓存 */
export function useCreationConfig() {
  return useQuery({
    queryKey: ["creation-types"],
    queryFn: () => api<CreationTypesConfig>("/config/creation-types"),
    staleTime: 5 * 60_000,
  });
}
