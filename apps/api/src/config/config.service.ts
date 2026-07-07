import { Injectable } from '@nestjs/common';
import type { RunMode } from '@helix/shared';

/**
 * Central, read-only configuration sourced from env.
 * The two computed flags drive the whole app's behaviour:
 *   - useSupabase → real Supabase repositories, else in-memory mock store
 *   - useEve      → call the eve agent over HTTP, else a local stub generator
 * Both flags fall back gracefully so the platform runs end-to-end with zero keys.
 */
@Injectable()
export class ConfigService {
  readonly mode: RunMode;
  readonly port: number;
  readonly defaultOrgId: string;
  readonly webOrigin: string;

  readonly supabaseUrl?: string;
  readonly supabaseAnonKey?: string;
  readonly supabaseServiceKey?: string;
  readonly databaseUrl?: string;

  readonly eveApiUrl?: string;
  readonly openaiKey?: string;
  readonly anthropicKey?: string;
  readonly draftModel?: string;
  readonly qualityModel?: string;

  constructor() {
    this.mode = (process.env.HELIX_MODE as RunMode) || 'mock';
    this.port = Number(process.env.API_PORT || 4000);
    this.defaultOrgId =
      process.env.HELIX_ORG_ID || '00000000-0000-0000-0000-000000000001';
    this.webOrigin = process.env.WEB_ORIGIN || 'http://localhost:3000';

    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.databaseUrl = process.env.DATABASE_URL;

    this.eveApiUrl = process.env.EVE_API_URL;
    this.openaiKey = process.env.OPENAI_API_KEY;
    this.anthropicKey = process.env.ANTHROPIC_API_KEY;
    this.draftModel = process.env.HELIX_MODEL_DRAFT;
    this.qualityModel = process.env.HELIX_MODEL_QUALITY;
  }

  get useSupabase(): boolean {
    return this.mode === 'supabase' && !!this.supabaseUrl && !!this.supabaseServiceKey;
  }

  get useEve(): boolean {
    return !!this.eveApiUrl && (!!this.openaiKey || !!this.anthropicKey);
  }

  /** Human-readable summary for the health endpoint + boot log. */
  get summary() {
    return {
      mode: this.mode,
      supabase: this.useSupabase,
      eve: this.useEve,
      hasOpenaiKey: !!this.openaiKey,
      hasAnthropicKey: !!this.anthropicKey,
      draftModel: this.draftModel ?? null,
      qualityModel: this.qualityModel ?? null,
    };
  }
}
