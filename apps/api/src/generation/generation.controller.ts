import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { creationTypeSchema, taskParamsSchema } from "@dreamina/shared";

import { SupabaseJwtGuard } from "../auth/auth.guard";
import { ZodBodyPipe } from "../common/zod.pipe";
import { GenerationService } from "./generation.service";

const createTaskSchema = z
  .object({
    type: z.enum(["image", "video", "music", "dubbing", "digital_human", "motion_mimic", "agent"]),
    prompt: z.string().min(1).max(4000),
    model_code: z.string().max(120).optional(),
    params: z.record(z.unknown()).optional(),
  })
  .superRefine((v, ctx) => {
    const parsed = taskParamsSchema(creationTypeSchema.parse(v.type)).safeParse(v.params ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["params"],
        message: issue ? `${issue.path.join(".") || "params"}: ${issue.message}` : "invalid params",
      });
    }
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
