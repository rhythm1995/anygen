import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";

import { SupabaseJwtGuard } from "../auth/auth.guard";
import { MeService } from "./me.service";

@Controller("me")
@UseGuards(SupabaseJwtGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  async getMe(@Req() req: Request) {
    await this.me.ensureProfile(req.user!);
    const { profile, credit } = await this.me.profileWithCredits(req.user!.id);
    return {
      id: profile.id,
      name: profile.name,
      avatarUrl: profile.avatar_url,
      description: profile.description,
      creditBalance: profile.credit_balance,
      credit,
    };
  }
}
