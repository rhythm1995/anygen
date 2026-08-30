import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import { SupabaseJwtGuard } from "../auth/auth.guard";
import { ZodBodyPipe } from "../common/zod.pipe";
import { FreeAgentService } from "./free-agent.service";

const createFreeSchema = z.object({ prompt: z.string().min(1).max(4000) });

@Controller("agent/free")
@UseGuards(SupabaseJwtGuard)
export class FreeAgentController {
  constructor(private readonly free: FreeAgentService) {}

  @Post("sessions")
  create(
    @Req() req: Request,
    @Body(new ZodBodyPipe(createFreeSchema)) body: z.infer<typeof createFreeSchema>,
  ) {
    return this.free.createFreeSession(req.user!.id, body.prompt);
  }

  /** 运行一轮 loop 并以 SSE 推送事件（事件在响应完成后落库可查） */
  @Post("sessions/:id/run")
  async run(
    @Req() req: Request,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    res.setHeader("content-type", "text/event-stream");
    res.setHeader("cache-control", "no-cache");
    res.setHeader("connection", "keep-alive");
    res.flushHeaders();
    try {
      const { status } = await this.free.runSession(req.user!.id, id, 12, (e) => {
        res.write(`event: ${e.type}\ndata: ${JSON.stringify(e.payload)}\n\n`);
      });
      res.write(`event: end\ndata: ${JSON.stringify({ status })}\n\n`);
    } catch (e) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: (e as Error).message })}\n\n`);
    }
    res.end();
  }

  @Get("sessions/:id")
  detail(@Req() req: Request, @Param("id") id: string) {
    return this.free.getSession(req.user!.id, id);
  }
}
