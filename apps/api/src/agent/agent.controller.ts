import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { SupabaseJwtGuard } from "../auth/auth.guard";
import { ZodBodyPipe } from "../common/zod.pipe";
import { SupabaseClientFactory } from "../auth/supabase.client";
import { ConfigService } from "../config/config.service";
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
    private readonly config: ConfigService,
  ) {}

  private get db() {
    return this.factory.serviceClient;
  }

  @Get("skills")
  async skills(@Req() req: Request) {
    const { data, error } = await this.db
      .from("agent_skills")
      .select("id,name,title,description,official,plan_template,user_id")
      .eq("enabled", true)
      .or(`user_id.is.null,user_id.eq.${req.user!.id}`)
      .order("id");
    if (error) throw new Error(error.message);
    return (data ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      title: s.title,
      description: s.description,
      official: s.official,
      user_id: s.user_id ?? null,
      step_count: (s.plan_template?.steps ?? []).length,
      plan_template: s.plan_template ?? {},
    }));
  }

  @Post("skills/draft")
  async draftSkill(
    @Body(new ZodBodyPipe(z.object({ description: z.string().min(1).max(2000), name: z.string().max(80).optional() })))
    body: { description: string; name?: string },
  ) {
    const fallback = {
      name: body.name || body.description.slice(0, 16),
      title: body.name || body.description.slice(0, 16),
      description: body.description,
      plan_template: {
        steps: [
          { title: "生成", type: "image", prompt_suffix: body.description, count: 1, params: { resolution: "2k", count: 1 } },
        ],
      },
      used_llm: false,
    };
    if (!this.config.useLlm) return fallback;
    try {
      const res = await fetch(`${this.config.llmApiBase}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.config.llmApiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: this.config.llmModel,
          messages: [
            {
              role: "system",
              content:
                '把用户的技能描述拆成 JSON：{"name":string,"title":string,"description":string,"plan_template":{"steps":[{"title":string,"type":"image"|"video"|"music"|"note","prompt_suffix":string,"count":1,"params":{}}]}}。只输出 JSON。',
            },
            { role: "user", content: body.description },
          ],
          temperature: 0.3,
        }),
      });
      if (!res.ok) return fallback;
      const out = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = out.choices?.[0]?.message?.content ?? "";
      const jsonText = text.replace(/^```json\s*|```$/g, "").trim();
      const parsed = JSON.parse(jsonText.match(/\{[\s\S]*\}/)?.[0] ?? "");
      return { ...fallback, ...parsed, used_llm: true };
    } catch {
      return fallback;
    }
  }

  @Post("skills")
  async createSkill(
    @Req() req: Request,
    @Body(new ZodBodyPipe(z.object({
      name: z.string().min(1).max(80),
      title: z.string().max(80).optional(),
      description: z.string().max(500).optional().default(""),
      plan_template: z.object({ steps: z.array(z.unknown()).max(20) }).optional(),
    }))) body: { name: string; title?: string; description?: string; plan_template?: { steps: unknown[] } },
  ) {
    const id = `usr_${randomUUID()}`;
    const row = {
      id,
      name: body.name,
      title: body.title || body.name,
      description: body.description ?? "",
      enabled: true,
      official: false,
      user_id: req.user!.id,
      plan_template: body.plan_template ?? { steps: [{ title: "生成", type: "image", prompt_suffix: "", count: 1, params: { resolution: "2k", count: 1 } }] },
    };
    const { data, error } = await this.db.from("agent_skills").insert(row).select().single();
    if (error) throw new Error(error.message);
    return { ...data, step_count: (data.plan_template?.steps ?? []).length };
  }

  @Patch("skills/:id")
  async patchSkill(
    @Req() req: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(z.object({
      name: z.string().min(1).max(80).optional(),
      title: z.string().max(80).optional(),
      description: z.string().max(500).optional(),
      plan_template: z.object({ steps: z.array(z.unknown()).max(20) }).optional(),
      enabled: z.boolean().optional(),
    }))) body: Record<string, unknown>,
  ) {
    const { data, error } = await this.db
      .from("agent_skills")
      .update(body)
      .eq("id", id)
      .eq("user_id", req.user!.id)
      .eq("official", false)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new HttpException("skill not found", 404);
    return data;
  }

  @Delete("skills/:id")
  async deleteSkill(@Req() req: Request, @Param("id") id: string) {
    const { data, error } = await this.db
      .from("agent_skills")
      .delete()
      .eq("id", id)
      .eq("user_id", req.user!.id)
      .eq("official", false)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new HttpException("skill not found", 404);
    return { deleted: true };
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


