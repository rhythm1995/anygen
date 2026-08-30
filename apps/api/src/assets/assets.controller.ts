import { Body, Controller, Delete, Get, HttpException, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { assetKindSchema } from "@dreamina/shared";

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
  async list(@Req() req: Request, @Query("kind") kind?: string, @Query("limit") limit?: string) {
    const parsedKind = assetKindSchema.safeParse(kind);
    const n = Math.min(Math.max(Number(limit ?? 50), 1), 200);
    let q = this.factory.serviceClient
      .from("assets")
      .select("*")
      .eq("user_id", req.user!.id)
      .order("created_at", { ascending: false })
      .limit(n);
    if (parsedKind.success) q = q.eq("kind", parsedKind.data);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      kind: r.kind,
      storageKey: r.storage_key,
      url: r.url,
      mime: r.mime,
      width: r.width,
      height: r.height,
      meta: r.meta,
      createdAt: r.created_at,
    }));
  }
}
