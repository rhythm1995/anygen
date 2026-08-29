import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";

import { SupabaseJwtGuard } from "../auth/auth.guard";
import { FeedService } from "./feed.service";

@Controller("feed")
@UseGuards(SupabaseJwtGuard)
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  list(@Query("offset") offset?: string) {
    const n = Number(offset ?? 0);
    return this.feed.page(Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
  }
}
