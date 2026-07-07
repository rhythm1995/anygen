import { Injectable, OnModuleInit } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '../config/config.service';

/**
 * Lazily creates a Supabase client with the service-role key (server-side,
 * bypasses RLS). Returns null when Supabase is not configured (mock mode).
 */
@Injectable()
export class SupabaseClientFactory implements OnModuleInit {
  private client: SupabaseClient | null = null;

  constructor(private cfg: ConfigService) {}

  onModuleInit() {
    if (this.cfg.useSupabase) {
      this.client = createClient(
        this.cfg.supabaseUrl!,
        this.cfg.supabaseServiceKey!,
        { auth: { persistSession: false } },
      );
    }
  }

  get(): SupabaseClient | null {
    return this.client;
  }
}
