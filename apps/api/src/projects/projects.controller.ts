import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { SupabaseJwtGuard } from "../auth/auth.guard";
import { ZodBodyPipe } from "../common/zod.pipe";
import { GraphValidationError, ProjectsService } from "./projects.service";

const createProjectSchema = z.object({ name: z.string().max(120).optional() });
const patchProjectSchema = z.object({
  name: z.string().max(120).optional(),
  graph: z.unknown().optional(),
});

@Controller("projects")
@UseGuards(SupabaseJwtGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.projects.list(req.user!.id);
  }

  @Get(":id")
  async get(@Req() req: Request, @Param("id") id: string) {
    const project = await this.projects.get(req.user!.id, id);
    if (!project) throw new HttpException("project not found", 404);
    return project;
  }

  @Post()
  create(@Req() req: Request, @Body(new ZodBodyPipe(createProjectSchema)) body: z.infer<typeof createProjectSchema>) {
    return this.projects.create(req.user!.id, body);
  }

  @Patch(":id")
  async patch(
    @Req() req: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(patchProjectSchema)) body: z.infer<typeof patchProjectSchema>,
  ) {
    try {
      const project = await this.projects.patch(req.user!.id, id, body);
      if (!project) throw new HttpException("project not found", 404);
      return project;
    } catch (e) {
      if (e instanceof GraphValidationError) throw new HttpException(e.message, 422);
      throw e;
    }
  }

  @Delete(":id")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.projects.remove(req.user!.id, id);
  }
}
