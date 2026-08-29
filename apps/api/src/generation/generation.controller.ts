import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { SupabaseJwtGuard } from "../auth/auth.guard";
import { ZodBodyPipe } from "../common/zod.pipe";
import { GenerationService } from "./generation.service";

const createTaskSchema = z.object({
  type: z.enum(["image", "video"]),
  prompt: z.string().min(1).max(4000),
  params: z.record(z.unknown()).optional(),
});

@Controller("generation/tasks")
@UseGuards(SupabaseJwtGuard)
export class GenerationController {
  constructor(private readonly generation: GenerationService) {}

  @Post()
  create(
    @Req() req: Request,
    @Body(new ZodBodyPipe(createTaskSchema)) body: z.infer<typeof createTaskSchema>,
  ) {
    return this.generation.createTask(req.user!.id, body);
  }

  @Get()
  list(@Req() req: Request) {
    return this.generation.listTasks(req.user!.id);
  }

  @Get(":id")
  poll(@Req() req: Request, @Param("id") id: string) {
    return this.generation.pollTask(req.user!.id, id);
  }
}
