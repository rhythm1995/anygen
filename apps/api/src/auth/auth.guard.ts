import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

import { SupabaseClientFactory } from "./supabase.client";

export interface AuthedUser {
  id: string;
  email?: string;
}

declare module "express" {
  interface Request {
    user?: AuthedUser;
  }
}

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  constructor(private readonly factory: SupabaseClientFactory) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!this.factory.configured) {
      throw new UnauthorizedException("auth backend not configured");
    }
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new UnauthorizedException("missing bearer token");
    }
    try {
      const { data, error } = await this.factory.verifier().getUser(token);
      if (error || !data?.user) {
        throw new UnauthorizedException("invalid token");
      }
      req.user = { id: data.user.id, email: data.user.email ?? undefined };
      return true;
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException("invalid token");
    }
  }
}
