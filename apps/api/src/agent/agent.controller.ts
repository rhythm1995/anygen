import { Body, Controller, Get, HttpException, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { SupabaseJwtGuard } from "../auth/auth.guard";
import { ZodBodyPipe } from "../common/zod.pipe";
import { SupabaseClientFactory } from "../auth/supabase.client";
import { AgentService } from "./agent.service";

const createSchema = z.object({
  skill_id: z.string().max(80).optional(),
  prompt: z.string().min(1).max(4000),
});

@Controller("agent")
@UseGuards(SupabaseJwtGuard)
export class AgentController {
  constructor(
    private readonly agent: AgentService,
    private readonly factory: SupabaseClientFactory,
  ) {}

  private get db() {
    return this.factory.serviceClient;
  }

  @Get("skills")
  async skills() {
    const { data, error } = await this.db
      .from("agent_skills")
      .select("id,name,title,description,official,plan_template")
      .eq("enabled", true)
      .order("id");
    if (error) throw new Error(error.message);
    return (data ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      title: s.title,
      description: s.description,
      official: s.official,
      step_count: (s.plan_template?.steps ?? []).length,
    }));
  }



  @Get("sessions")
  list(@Req() req: Request) {
    return this.agent.listSessions(req.user!.id);
  }

  @Post("sessions")
  async create(
    @Req() req: Request,
    @Body(new ZodBodyPipe(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    return this.agent.createSession(req.user!.id, body);
  }

  @Get("sessions/:id")
  async detail(@Req() req: Request, @Param("id") id: string) {
    const { data: session, error } = await this.agent.getSession(req.user!.id, id);
    if (error) throw new Error(error.message);
    if (!session) throw new HttpException("session not found", 404);
    const { data: steps, error: serr } = await this.agent.getSteps(req.user!.id, id);
    if (serr) throw new Error(serr.message);
    return { ...session, steps: steps ?? [] };
  }

  /** 推进执行（前端轮询调用；幂等） */
  @Post("sessions/:id/advance")
  async advance(@Req() req: Request, @Param("id") id: string) {
    return this.agent.advance(req.user!.id, id);
  }
}

function HttpException2(message: string, status: number) {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}
