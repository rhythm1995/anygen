import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { generationPreferenceSchema } from "@dreamina/shared";

import { SupabaseJwtGuard } from "../auth/auth.guard";
import { ZodBodyPipe } from "../common/zod.pipe";
import { MeService } from "./me.service";

@Controller("me")
@UseGuards(SupabaseJwtGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  async getMe(@Req() req: Request) {
    await this.me.ensureProfile(req.user!);
    const { profile } = await this.me.profileWithCredits(req.user!.id);
    return {
      id: profile.id,
      name: profile.name,
      avatarUrl: profile.avatar_url,
      description: profile.description,
      role: profile.role ?? "user",
      balance_cents: profile.balance_cents,
      preferences: profile.preferences ?? {},
    };
  }

  @Patch("preferences")
  async patchPreferences(
    @Req() req: Request,
    @Body(new ZodBodyPipe(generationPreferenceSchema)) body: Record<string, unknown>,
  ) {
    return this.me.patchPreferences(req.user!.id, body);
  }
}
