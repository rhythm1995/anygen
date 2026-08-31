import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import {
  assetBatchSchema,
  assetFilterRatioSchema,
  assetFilterResolutionSchema,
  assetKindSchema,
  assetPatchSchema,
  assetSortSchema,
} from "@dreamina/shared";

import { SupabaseJwtGuard } from "../auth/auth.guard";
import { SupabaseClientFactory } from "../auth/supabase.client";
import { ZodBodyPipe } from "../common/zod.pipe";
import { StorageService } from "./storage.service";

const presignSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(3).max(100),
  kind: assetKindSchema,
});
const registerSchema = z.object({
  key: z.string().min(3).max(500),
  kind: assetKindSchema,
  mime: z.string().max(100),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  meta: z.record(z.unknown()).optional(),
});

// 比例匹配容差（绝对值 0.02，覆盖生成图常见取整误差）
const RATIO_TOLERANCE = 0.02;
// 超清阈值：长边 ≥ 2560（2K 及以上的清晰档）
const HD_MIN_EDGE = 2560;

// 长边 → 1K/2K/4K/8K 分桶（log 最近邻，桶中心 1024/2048/4096/8192，几何分界 724/1448/2896/5792/11585）
function resolutionBucket(maxEdge: number): "1K" | "2K" | "4K" | "8K" | null {
  if (maxEdge < 724 || maxEdge >= 11585) return null;
  if (maxEdge < 1448) return "1K";
  if (maxEdge < 2896) return "2K";
  if (maxEdge < 5792) return "4K";
  return "8K";
}

function matchesRatio(width: number | null, height: number | null, ratio: string): boolean {
  if (!width || !height) return false;
  const [rw, rh] = ratio.split(":").map(Number);
  if (!rw || !rh) return false;
  return Math.abs(width / height - rw / rh) <= RATIO_TOLERANCE;
}

@Controller("assets")
@UseGuards(SupabaseJwtGuard)
export class AssetsController {
  constructor(
    private readonly storage: StorageService,
    private readonly factory: SupabaseClientFactory,
  ) {}

  @Post("presign")
  presign(
    @Req() req: Request,
    @Body(new ZodBodyPipe(presignSchema)) body: z.infer<typeof presignSchema>,
  ) {
    return this.storage.presign({ userId: req.user!.id, ...body });
  }

  @Post()
  register(
    @Req() req: Request,
    @Body(new ZodBodyPipe(registerSchema)) body: z.infer<typeof registerSchema>,
  ) {
    return this.storage.register(this.factory.serviceClient, { userId: req.user!.id, ...body });
  }

  @Patch(":id")
  async patch(
    @Req() req: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(assetPatchSchema)) body: z.infer<typeof assetPatchSchema>,
  ) {
    const { data, error } = await this.factory.serviceClient
      .from("assets")
      .update(body)
      .eq("id", id)
      .eq("user_id", req.user!.id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new HttpException("asset not found", 404);
    return this.serializeRow(data);
  }

  @Post("batch")
  async batch(
    @Req() req: Request,
    @Body(new ZodBodyPipe(assetBatchSchema)) body: z.infer<typeof assetBatchSchema>,
  ) {
    const client = this.factory.serviceClient;
    const ids = body.ids;
    if (body.action === "delete") {
      const { data, error } = await client
        .from("assets")
        .delete()
        .in("id", ids)
        .eq("user_id", req.user!.id)
        .select("id");
      if (error) throw new Error(error.message);
      return { updated: (data ?? []).length };
    }
    const patch =
      body.action === "favorite"
        ? { favorited: true }
        : body.action === "unfavorite"
          ? { favorited: false }
          : { published: true };
    const { data, error } = await client
      .from("assets")
      .update(patch)
      .in("id", ids)
      .eq("user_id", req.user!.id)
      .select("id");
    if (error) throw new Error(error.message);
    return { updated: (data ?? []).length };
  }

  @Delete(":id")
  async remove(@Req() req: Request, @Param("id") id: string) {
    const { data, error } = await this.factory.serviceClient
      .from("assets")
      .delete()
      .eq("id", id)
      .eq("user_id", req.user!.id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new HttpException("asset not found", 404);
    return { deleted: true, storageKey: (data as any).storage_key };
  }

  @Get()
  async list(
    @Req() req: Request,
    @Query("kind") kind?: string,
    @Query("limit") limit?: string,
    @Query("fav") fav?: string,
    @Query("hd") hd?: string,
    @Query("res") res?: string,
    @Query("ratio") ratio?: string,
    @Query("q") q?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("sort") sort?: string,
  ) {
    const client = this.factory.serviceClient;
    const parsedKind = assetKindSchema.safeParse(kind);
    const parsedSort = assetSortSchema.safeParse(sort);
    // 筛选面板为多选 checkbox → 逗号分隔多值
    const parsedRes = z.array(assetFilterResolutionSchema).safeParse(res?.split(",").filter(Boolean));
    const parsedRatio = z.array(assetFilterRatioSchema).safeParse(ratio?.split(",").filter(Boolean));

    // DB 侧先做便宜过滤（索引列 + 时间 + 文本），比例/分辨率在应用层推导（见 D8）
    let query = client
      .from("assets")
      .select("*")
      .eq("user_id", req.user!.id)
      .order("created_at", { ascending: parsedSort.success ? parsedSort.data === "asc" : false })
      .limit(Math.min(Math.max(Number(limit ?? 500), 1), 1000));
    if (parsedKind.success) query = query.eq("kind", parsedKind.data);
    if (fav === "1") query = query.eq("favorited", true);
    if (from && !Number.isNaN(Date.parse(from))) query = query.gte("created_at", from);
    if (to && !Number.isNaN(Date.parse(to))) query = query.lte("created_at", to);
    if (q && q.trim()) {
      // PostgREST or-filter：清洗通配/分隔符防注入语法错误
      const safe = q.trim().replace(/[,()*]/g, "").slice(0, 60);
      if (safe) query = query.or(`meta->>prompt.ilike.*${safe}*,storage_key.ilike.*${safe}*`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    let rows = (data ?? []).map((r: any) => this.serializeRow(r));
    if (hd === "1") {
      rows = rows.filter((a) => (a.width ?? 0) >= HD_MIN_EDGE || (a.height ?? 0) >= HD_MIN_EDGE);
    }
    if (parsedRes.success && parsedRes.data.length) {
      rows = rows.filter((a) => parsedRes.data.includes(resolutionBucket(Math.max(a.width ?? 0, a.height ?? 0)) as never));
    }
    if (parsedRatio.success && parsedRatio.data.length) {
      rows = rows.filter((a) => parsedRatio.data.some((r) => matchesRatio(a.width, a.height, r)));
    }
    return rows;
  }

  private serializeRow(r: any) {
    return {
      id: r.id,
      kind: r.kind,
      storageKey: r.storage_key,
      url: r.url,
      mime: r.mime,
      width: r.width,
      height: r.height,
      sizeBytes: r.size_bytes,
      favorited: r.favorited ?? false,
      published: r.published ?? false,
      meta: r.meta ?? {},
      createdAt: r.created_at,
    };
  }
}
