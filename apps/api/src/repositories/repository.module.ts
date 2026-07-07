import { Global, Module } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { SupabaseClientFactory } from '../auth/supabase.client';
import { REPOSITORIES } from './repository';
import { InMemoryRepositories } from './in-memory.repository';
import { SupabaseRepositories } from './supabase.repository';

/**
 * Picks the repository implementation from HELIX_MODE.
 *   mock     → InMemoryRepositories (seeded, zero-config)
 *   supabase → SupabaseRepositories (real Postgres via supabase-js)
 * Global so every module can inject REPOSITORIES without re-importing.
 */
@Global()
@Module({
  providers: [
    {
      provide: REPOSITORIES,
      inject: [ConfigService, SupabaseClientFactory],
      useFactory: (cfg: ConfigService, supabase: SupabaseClientFactory) => {
        const client = supabase.get();
        return cfg.useSupabase && client
          ? new SupabaseRepositories(client)
          : new InMemoryRepositories();
      },
    },
  ],
  exports: [REPOSITORIES],
})
export class RepositoryModule {}
