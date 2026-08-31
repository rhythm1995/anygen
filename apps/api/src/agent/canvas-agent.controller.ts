import { Body, Controller, Get, HttpException, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { SupabaseJwtGuard } from "../auth/auth.guard";
import { ZodBodyPipe } from "../common/zod.pipe";
import { CanvasAgentTurnService } from "./canvas-agent-turn.service";

/** 协议消息（与 web 端 canvas/types.ts CanvasAgentProtocolMessage 对齐） */
const contentSchema = z.union([
  z.string().max(64_000),
  z.array(z.union([z.object({ type: z.literal("text"), text: z.string().max(32_000) }), z.object({ type: z.literal("image_url"), image_url: z.object({ url: z.string().max(200_000).optional() }).optional() })])).max(32),
]);

const messageSchema = z.union([
  z.object({
    role: z.enum(["system", "user"]),
    content: contentSchema,
  }),
  z.object({
    role: z.literal("assistant"),
    content: z.string().max(64_000).optional(),
    reasoningContent: z.string().max(64_000).optional(),
    toolCalls: z.array(z.object({ id: z.string().max(128), name: z.string().max(128), arguments: z.record(z.string(), z.unknown()) })).max(32).optional(),
  }),
  z.object({
    role: z.literal("tool"),
    content: z.string().max(64_000),
    toolCallId: z.string().max(128),
    name: z.string().max(128).optional(),
  }),
]);

const toolSchema = z.object({
  type: z.literal("function").optional(),
  function: z.object({
    name: z.string().min(1).max(128),
    description: z.string().max(8_000).optional(),
    parameters: z.unknown().optional(),
  }),
});

const turnSchema = z.object({
  systemPrompt: z.string().max(32_000),
  messages: z.array(messageSchema).min(1).max(160),
  tools: z.array(toolSchema).max(32).optional(),
  allowTools: z.boolean().optional().default(true),
  temperature: z.number().min(0).max(2).optional(),
  model: z.string().max(160).optional(),
});

/**
 * 画布 Agent 单轮 LLM 代理（D12 Phase C）。
 * 浏览器不下发 LLM key；客户端保留 loop/状态（tigerowo runtime），每轮经此端点转发。
 * 内部平台：systemPrompt 由前端技能模板生成，随会话透传。
 */
@Controller("agent/canvas")
@UseGuards(SupabaseJwtGuard)
export class CanvasAgentController {
  constructor(private readonly turn: CanvasAgentTurnService) {}

  @Post("turn")
  runTurn(@Req() req: Request, @Body(new ZodBodyPipe(turnSchema)) body: z.infer<typeof turnSchema>) {
    return this.turn.runTurn(req.user!.id, body);
  }

  @Get("config")
  config(@Req() req: Request) {
    return this.turn.configFor(req.user!.id);
  }
}

export { HttpException };
