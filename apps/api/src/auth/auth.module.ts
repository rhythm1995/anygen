import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SupabaseClientFactory } from './supabase.client';
import { AuthGuard } from './auth.guard';

@Global()
@Module({
  providers: [SupabaseClientFactory, AuthGuard, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [SupabaseClientFactory],
})
export class AuthModule {}
