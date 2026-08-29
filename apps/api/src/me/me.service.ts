import { Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseClientFactory } from "../auth/supabase.client";
import { ConfigService } from "../config/config.service";
import { CreditsService } from "../credits/credits.service";

@Injectable()
export class MeService {
  constructor(
    private readonly factory: SupabaseClientFactory,
    private readonly config: ConfigService,
    private readonly credits: CreditsService,
  ) {}

  private get db(): SupabaseClient {
    return this.factory.serviceClient;
  }

  async ensureProfile(user: { id: string; email?: string }) {
    const existing = await this.db.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) return existing.data;
    const emailName = user.email?.split("@")[0] ?? "creator";
    const { data, error } = await this.db
      .from("profiles")
      .upsert({ id: user.id, name: emailName, avatar_url: "" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    // 开通赠送（INITIAL_GRANT_CENTS，默认 $5.00；内部使用，无注册赠金语义）
    await this.credits.grantInitial(user.id, this.config.initialGrantCents).catch(() => undefined);
    return data;
  }

  async profileWithCredits(userId: string) {
    const profile = await this.db.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (profile.error) throw new Error(profile.error.message);
    return { profile: profile.data };
  }
}
