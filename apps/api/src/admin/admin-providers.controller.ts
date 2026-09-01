import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { SupabaseJwtGuard } from "../auth/auth.guard";
import { SupabaseClientFactory } from "../auth/supabase.client";
import { ZodBodyPipe } from "../common/zod.pipe";
import { AdminAuditService } from "./admin-audit.service";
import { AdminGuard } from "./admin.guard";
import { ProviderKeysService } from "./provider-keys.service";
import { decryptSecret, encryptSecret, secretHint } from "./secret-crypto";

const providerSchema = z.object({
  name: z.string().min(1).max(60),
  protocol: z.enum(["ark", "openai-compat", "openmontage-bridge"]),
  base_url: z.string().max(300).optional().default(""),
  enabled: z.boolean().optional().default(true),
});

const patchProviderSchema = providerSchema.partial();

const keySchema = z.object({
  secret: z.string().min(4).max(4000),
  enabled: z.boolean().optional().default(true),
});

const settingsSchema = z.object({
  initial_grant_cents: z.number().int().min(0).max(1_000_000).optional(),
});

@Controller("admin")
@UseGuards(SupabaseJwtGuard, AdminGuard)
export class AdminProvidersController {
  constructor(
    private readonly factory: SupabaseClientFactory,
    private readonly audit: AdminAuditService,
    private readonly keys: ProviderKeysService,
  ) {}

  private get db() {
    return this.factory.serviceClient;
  }

  @Get("providers")
  async listProviders() {
    const { data, error } = await this.db.from("providers").select("*").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  @Post("providers")
  async createProvider(@Req() req: Request, @Body(new ZodBodyPipe(providerSchema)) body: z.infer<typeof providerSchema>) {
    const { data, error } = await this.db.from("providers").insert(body).select().single();
    if (error) throw new HttpException(error.message, 400);
    await this.audit.record({
      adminId: req.user!.id,
      action: "provider.create",
      targetTable: "providers",
      targetId: data.id,
      diff: { name: body.name },
    });
    return data;
  }

  @Patch("providers/:id")
  async patchProvider(
    @Req() req: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(patchProviderSchema)) body: z.infer<typeof patchProviderSchema>,
  ) {
    const { data, error } = await this.db.from("providers").update({ ...body, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    if (!data) throw new HttpException("provider not found", 404);
    await this.audit.record({
      adminId: req.user!.id,
      action: "provider.patch",
      targetTable: "providers",
      targetId: id,
      diff: body as Record<string, unknown>,
    });
    return data;
  }

  @Get("providers/:id/keys")
  async listKeys(@Param("id") id: string) {
    const { data, error } = await this.db
      .from("api_keys")
      .select("id,provider_id,secret_hint,enabled,created_at")
      .eq("provider_id", id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  @Post("providers/:id/keys")
  async addKey(
    @Req() req: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(keySchema)) body: z.infer<typeof keySchema>,
  ) {
    const encKey = this.keys.requireEncryptionKey();
    const { data: provider } = await this.db.from("providers").select("id,name").eq("id", id).maybeSingle();
    if (!provider) throw new HttpException("provider not found", 404);
    const row = {
      provider_id: id,
      secret_encrypted: encryptSecret(body.secret, encKey),
      secret_hint: secretHint(body.secret),
      enabled: body.enabled ?? true,
    };
    const { data, error } = await this.db.from("api_keys").insert(row).select("id,provider_id,secret_hint,enabled,created_at").single();
    if (error) throw new Error(error.message);
    await this.audit.record({
      adminId: req.user!.id,
      action: "api_key.create",
      targetTable: "api_keys",
      targetId: data.id,
      diff: { provider: provider.name, hint: row.secret_hint },
    });
    return data;
  }

  @Patch("providers/:id/keys/:keyId")
  async patchKey(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("keyId") keyId: string,
    @Body(new ZodBodyPipe(z.object({ enabled: z.boolean() }))) body: { enabled: boolean },
  ) {
    const { data, error } = await this.db
      .from("api_keys")
      .update({ enabled: body.enabled })
      .eq("id", keyId)
      .eq("provider_id", id)
      .select("id,provider_id,secret_hint,enabled,created_at")
      .single();
    if (error) throw new Error(error.message);
    await this.audit.record({
      adminId: req.user!.id,
      action: "api_key.patch",
      targetTable: "api_keys",
      targetId: keyId,
      diff: { enabled: body.enabled },
    });
    return data;
  }

  @Delete("providers/:id/keys/:keyId")
  async deleteKey(@Req() req: Request, @Param("id") id: string, @Param("keyId") keyId: string) {
    const { error } = await this.db.from("api_keys").delete().eq("id", keyId).eq("provider_id", id);
    if (error) throw new Error(error.message);
    await this.audit.record({
      adminId: req.user!.id,
      action: "api_key.delete",
      targetTable: "api_keys",
      targetId: keyId,
      diff: {},
    });
    return { deleted: true };
  }

  @Post("providers/:id/keys/:keyId/test")
  async testKey(@Param("id") id: string, @Param("keyId") keyId: string) {
    const encKey = this.keys.requireEncryptionKey();
    const { data: provider } = await this.db.from("providers").select("*").eq("id", id).maybeSingle();
    if (!provider) throw new HttpException("provider not found", 404);
    const { data: keyRow } = await this.db.from("api_keys").select("*").eq("id", keyId).eq("provider_id", id).maybeSingle();
    if (!keyRow) throw new HttpException("key not found", 404);
    let secret: string;
    try {
      secret = decryptSecret(keyRow.secret_encrypted as string, encKey);
    } catch {
      throw new HttpException("decrypt failed", 500);
    }
    if (provider.protocol === "openmontage-bridge") {
      const { runOpenMontageBridge } = await import("../generation/openmontage-bridge");
      const out = await runOpenMontageBridge({ tool: "seedance_ark", action: "get_info" });
      return { ok: out.ok, detail: out.ok ? "bridge reachable" : out.error };
    }
    const base = String(provider.base_url || "").replace(/\/$/, "");
    if (!base) return { ok: false, detail: "no base_url" };
    try {
      const res = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${secret}` } });
      return { ok: res.ok || res.status === 404, status: res.status, detail: res.ok ? "reachable" : `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }

  @Get("settings")
  async settings() {
    const { data, error } = await this.db.from("app_settings").select("key,value");
    if (error) throw new Error(error.message);
    const map: Record<string, unknown> = {};
    for (const row of data ?? []) map[row.key] = row.value;
    return map;
  }

  @Patch("settings")
  async patchSettings(@Req() req: Request, @Body(new ZodBodyPipe(settingsSchema)) body: z.infer<typeof settingsSchema>) {
    if (body.initial_grant_cents !== undefined) {
      const { error } = await this.db
        .from("app_settings")
        .upsert({ key: "initial_grant_cents", value: body.initial_grant_cents, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      await this.audit.record({
        adminId: req.user!.id,
        action: "settings.patch",
        targetTable: "app_settings",
        targetId: "initial_grant_cents",
        diff: { initial_grant_cents: body.initial_grant_cents },
      });
    }
    return this.settings();
  }
}
