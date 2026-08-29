import { type CanActivate, type ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";
import type { Request } from "express";

import { SupabaseClientFactory } from "../auth/supabase.client";

/** 非 admin 一律 404（不暴露路由存在） */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly factory: SupabaseClientFactory) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const userId = req.user?.id;
    if (!userId || !this.factory.configured) throw new NotFoundException();
    const { data, error } = await this.factory.serviceClient
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (error || data?.role !== "admin") throw new NotFoundException();
    return true;
  }
}
