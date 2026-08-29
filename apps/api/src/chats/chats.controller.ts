import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { SupabaseJwtGuard } from "../auth/auth.guard";
import { ZodBodyPipe } from "../common/zod.pipe";
import { ChatsService } from "./chats.service";

const createChatSchema = z.object({ title: z.string().max(120).optional() });
const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(20000),
  taskIds: z.array(z.string().uuid()).max(20).optional(),
});

@Controller("chats")
@UseGuards(SupabaseJwtGuard)
export class ChatsController {
  constructor(private readonly chats: ChatsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.chats.list(req.user!.id);
  }

  @Post()
  create(@Req() req: Request, @Body(new ZodBodyPipe(createChatSchema)) body: z.infer<typeof createChatSchema>) {
    return this.chats.create(req.user!.id, body);
  }

  @Get(":id/messages")
  messages(@Req() req: Request, @Param("id") id: string) {
    return this.chats.messages(req.user!.id, id);
  }

  @Post(":id/messages")
  appendMessage(
    @Req() req: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(messageSchema)) body: z.infer<typeof messageSchema>,
  ) {
    return this.chats.appendMessage(req.user!.id, id, body);
  }
}
