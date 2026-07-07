import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { SupabaseClientFactory } from './supabase.client';

/**
 * Auth guard. In mock mode it is a pass-through (the platform is demoable with
 * no Supabase project). In supabase mode it verifies the Bearer JWT via
 * Supabase Auth and attaches the user to the request.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private cfg: ConfigService, private supabase: SupabaseClientFactory) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!this.cfg.useSupabase) return true; // mock mode — open

    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers['authorization'] as string | undefined;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('missing_bearer_token');

    const client = this.supabase.get();
    if (!client) return true;
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('invalid_token');
    req.user = data.user;
    return true;
  }
}
