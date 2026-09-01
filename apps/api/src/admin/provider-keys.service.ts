import { HttpException, Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseClientFactory } from "../auth/supabase.client";
import { ConfigService } from "../config/config.service";
import { decryptSecret } from "./secret-crypto";

const ENV_FALLBACK: Record<string, string | undefined> = {};

@Injectable()
export class ProviderKeysService {
  constructor(
    private readonly factory: SupabaseClientFactory,
    private readonly config: ConfigService,
  ) {}

  private get db(): SupabaseClient {
    return this.factory.serviceClient;
  }

  /** 解析供应商密钥：api_keys 表优先，env 回退。 */
  async resolve(providerName: string): Promise<string | undefined> {
    const cfg = await this.resolveConfig(providerName);
    return cfg.apiKey;
  }

  /** D14：密钥 + base_url（表优先，env 回退） */
  async resolveConfig(providerName: string): Promise<{ apiKey?: string; baseUrl?: string }> {
    const encKey = this.config.encryptionKey;
    const { data: provider } = await this.db
      .from("providers")
      .select("id,base_url")
      .eq("name", providerName)
      .eq("enabled", true)
      .maybeSingle();
    let apiKey: string | undefined;
    if (encKey && provider) {
      const { data: keyRow } = await this.db
        .from("api_keys")
        .select("secret_encrypted")
        .eq("provider_id", provider.id)
        .eq("enabled", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (keyRow?.secret_encrypted) {
        try {
          apiKey = decryptSecret(keyRow.secret_encrypted as string, encKey);
        } catch {
          apiKey = undefined;
        }
      }
    }
    return {
      apiKey: apiKey ?? this.envFallback(providerName),
      baseUrl: (typeof provider?.base_url === "string" && provider.base_url) || this.envBaseUrl(providerName),
    };
  }

  envFallback(providerName: string): string | undefined {
    switch (providerName) {
      case "ark":
        return this.config.arkApiKey;
      case "openrouter":
        return this.config.openRouterApiKey;
      case "elevenlabs":
        return this.config.elevenLabsApiKey;
      case "doubao-speech":
        return this.config.doubaoSpeechApiKey;
      default:
        return ENV_FALLBACK[providerName];
    }
  }

  envBaseUrl(providerName: string): string | undefined {
    switch (providerName) {
      case "ark":
        return this.config.arkBaseUrl;
      case "openrouter":
        return this.config.openRouterBaseUrl;
      default:
        return undefined;
    }
  }

  requireEncryptionKey(): string {
    const key = this.config.encryptionKey;
    if (!key) throw new HttpException("ENCRYPTION_KEY not configured", 503);
    return key;
  }
}
