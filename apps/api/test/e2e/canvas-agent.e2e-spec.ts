/**
 * 画布 Agent turn 端点 e2e（D12 Phase C）——真实 Supabase + 完整 Nest app。
 * 覆盖：鉴权、入参校验、LLM key 缺失时 503 如实文案（禁 mock）。
 * LLM key 已配置的环境会额外断言 200 契约（content/toolCalls 形状）。
 */
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "node:path";
import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

dotenvConfig({ path: resolve(__dirname, "../../.env.local"), override: true });

describe("canvas agent turn (e2e)", () => {
  let app: INestApplication;
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let userId: string;
  let token: string;
  let base = "";

  const authedPost = (url: string, body?: unknown) =>
    fetch(`${base}${url}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((r) => r.json().then((b) => ({ status: r.status, body: b })));
  const authedGet = (url: string) =>
    fetch(`${base}${url}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json().then((b) => ({ status: r.status, body: b })));

  beforeAll(async () => {
    const { createApp } = await import("../../src/bootstrap");
    app = await createApp();
    await app.listen(0);
    base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
    admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const email = `e2e-canvas-${randomUUID()}@dreamina.local`;
    const { data: created, error } = await admin.auth.admin.createUser({ email, password: "password-123", email_confirm: true });
    if (error) throw error;
    userId = created!.user!.id;
    const { data: session } = await anon.auth.signInWithPassword({ email, password: "password-123" });
    token = session!.session!.access_token;
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(userId);
    await app.close();
  });

  const validTurn = {
    systemPrompt: "你是画布创作助手。",
    messages: [{ role: "user" as const, content: "你好" }],
  };

  it("无 token → 401", async () => {
    const res = await fetch(`${base}/api/agent/canvas/turn`, { method: "POST", body: JSON.stringify(validTurn), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(401);
  });

  it("空 messages → 400", async () => {
    const res = await authedPost("/api/agent/canvas/turn", { systemPrompt: "x", messages: [] });
    expect(res.status).toBe(422);
  });

  it("非法 role → 400", async () => {
    const res = await authedPost("/api/agent/canvas/turn", { systemPrompt: "x", messages: [{ role: "hacker", content: "x" }] });
    expect(res.status).toBe(422);
  });

  it("tools 透传字段非法 → 400", async () => {
    const res = await authedPost("/api/agent/canvas/turn", { ...validTurn, tools: [{ function: { name: "" } }] });
    expect(res.status).toBe(422);
  });

  it("config 端点返回可用性（不泄露 key）", async () => {
    const res = await authedGet("/api/agent/canvas/config");
    expect(res.status).toBe(200);
    expect(typeof res.body.available).toBe("boolean");
    expect(JSON.stringify(res.body)).not.toMatch(/sk-|Bearer|api[_-]?key/i);
  });

  it("turn：无 LLM key → 503 如实文案；有 key → 200 契约", async () => {
    const res = await authedPost("/api/agent/canvas/turn", validTurn);
    if (!process.env.LLM_API_KEY) {
      expect(res.status).toBe(503);
      expect(String(res.body.message)).toMatch(/LLM_API_KEY/);
    } else {
      expect(res.status).toBe(200);
      expect(typeof res.body.content).toBe("string");
      expect(Array.isArray(res.body.toolCalls)).toBe(true);
    }
  });
});
