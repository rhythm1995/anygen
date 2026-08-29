import { Injectable, type OnModuleInit } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ConfigService } from "../config/config.service";

/**
 * Supabase 客户端工厂（模式参考自 Helix 项目，dreamina-clone/RECON/helix-patterns/）。
 * 未配置 SUPABASE_URL/SERVICE_ROLE_KEY 时 useSupabase=false，auth 模块明确拒绝而非放行。
 */
@Injectable()
export class SupabaseClientFactory implements OnModuleInit {
  private client: SupabaseClient | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (this.config.useSupabase) {
      this.client = createClient(this.config.supabaseUrl!, this.config.supabaseServiceRoleKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }

  get serviceClient(): SupabaseClient {
    if (!this.client) throw new Error("Supabase not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    return this.client;
  }

  /** 校验用户 JWT（Guard 用）：返回同步 auth 客户端（getUser 自身是异步） */
  verifier() {
    return this.serviceClient.auth;
  }

  get configured(): boolean {
    return this.client !== null;
  }
}
