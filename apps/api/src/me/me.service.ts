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
    // 注册奖励（CREDITS_SIGNUP_BONUS，默认 150）
    await this.credits.grant(user.id, this.config.signupBonusCredits, "signup_bonus").catch(() => undefined);
    return data;
  }

  async profileWithCredits(userId: string) {
    const profile = await this.db.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (profile.error) throw new Error(profile.error.message);
    const ledger = await this.db
      .from("credit_ledger")
      .select("delta,reason")
      .eq("user_id", userId)
      .order("id", { ascending: false })
      .limit(200);
    if (ledger.error) throw new Error(ledger.error.message);
    const rows = ledger.data ?? [];
    // 语义拆分：充值进 purchase，注册奖励进 gift（本地语义，无 vip 体系）
    const gift = rows.filter((r) => r.reason === "signup_bonus" || r.reason === "generation_refund").reduce((a, r) => a + Math.max(r.delta, 0), 0);
    const purchase = rows.filter((r) => r.reason === "topup").reduce((a, r) => a + Math.max(r.delta, 0), 0);
    return { profile: profile.data, credit: { vip: 0, gift, purchase, total: gift + purchase } };
  }
}
