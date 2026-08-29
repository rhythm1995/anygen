import { Module } from "@nestjs/common";
import { SupabaseClientFactory } from "./supabase.client";
import { SupabaseJwtGuard } from "./auth.guard";

@Module({
  providers: [SupabaseClientFactory, SupabaseJwtGuard],
  exports: [SupabaseClientFactory, SupabaseJwtGuard],
})
export class AuthModule {}
