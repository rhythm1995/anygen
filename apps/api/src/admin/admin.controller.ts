import { Body, Controller, Get, HttpException, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { SupabaseJwtGuard } from "../auth/auth.guard";
import { SupabaseClientFactory } from "../auth/supabase.client";
import { ZodBodyPipe } from "../common/zod.pipe";
import { CreditsService } from "../credits/credits.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminGuard } from "./admin.guard";

const patchModelSchema = z.object({
  price_cents: z.number().int().min(0).max(100_000).optional(),
  provider_cost_cents: z.number().int().min(0).max(100_000).optional(),
  enabled: z.boolean().optional(),
  badge: z.string().max(20).nullable().optional(),
  description: z.string().max(500).optional(),
  display_name: z.string().max(120).optional(),
});

const adjustBalanceSchema = z.object({
  delta_cents: z.number().int().min(-100_000).max(100_000),
  note: z.string().max(200).optional(),
});

@Controller("admin")
@UseGuards(SupabaseJwtGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly factory: SupabaseClientFactory,
    private readonly credits: CreditsService,
    private readonly audit: AdminAuditService,
  ) {}

  private get db() {
    return this.factory.serviceClient;
  }

  @Get("models")
  async models() {
    const { data, error } = await this.db
      .from("models")
      .select("*")
      .order("creation_type")
      .order("sort");
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  @Patch("models/:id")
  async patchModel(
    @Req() req: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(patchModelSchema)) body: z.infer<typeof patchModelSchema>,
  ) {
    const before = await this.db.from("models").select("*").eq("id", id).maybeSingle();
    if (before.error) throw new Error(before.error.message);
    if (!before.data) throw new HttpException('model not found', 404);
    const { data, error } = await this.db
      .from("models")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    const diff: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if ((before.data as any)[k] !== v) diff[k] = [(before.data as any)[k], v];
    }
    await this.audit.record({
      adminId: req.user!.id,
      action: "model.patch",
      targetTable: "models",
      targetId: id,
      diff,
    });
    return data;
  }

  @Get("users")
  async users() {
    const { data, error } = await this.db
      .from("profiles")
      .select("id,name,role,balance_cents,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  @Post("users/:id/adjust")
  async adjustBalance(
    @Req() req: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(adjustBalanceSchema)) body: z.infer<typeof adjustBalanceSchema>,
  ) {
    const balance = await this.credits.adminAdjust(id, body.delta_cents);
    await this.audit.record({
      adminId: req.user!.id,
      action: "user.adjust_balance",
      targetTable: "profiles",
      targetId: id,
      diff: { delta_cents: body.delta_cents, note: body.note ?? null, new_balance_cents: balance },
    });
    return { balance_cents: balance };
  }
}
