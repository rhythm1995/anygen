/**
 * D10 用户洞察 e2e —— admin 即超级管理员（role='admin'，不另设角色）。
 * 覆盖 GET /api/admin/insights/users(/:id)：AdminGuard 404 隐藏、RPC admin_user_stats 聚合口径
 * （spend=-sum(generation)，符号依据 0005 try_debit_cents）、auth.users 邮箱映射、三段最近记录。
 */
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "node:path";
import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

dotenvConfig({ path: resolve(__dirname, "../../.env.local"), override: true });

const STATS_SHAPE = {
  tasks_total: 2,
  tasks_succeeded: 1,
  tasks_failed: 1,
  tasks_image: 1,
  tasks_video: 1,
  spend_cents: 60,
  refund_cents: 20,
  granted_cents: 500,
  agent_sessions: 1,
  agent_spent_cents: 40,
  assets: 1,
  projects: 1,
  chats: 1,
};

describe("Admin user insights (e2e)", () => {
  let app: INestApplication;
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let base = "";
  let targetId = "";
  let targetEmail = "";
  let targetToken = "";
  let adminId = "";
  let adminEmail = "";
  let adminToken = "";
  let okTaskId = "";

  const get = (token: string, url: string) =>
    fetch(`${base}${url}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
      r.json().then((body) => ({ status: r.status, body })),
    );

  const createUser = async (prefix: string) => {
    const email = `${prefix}-${randomUUID()}@dreamina.local`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: "password-123",
      email_confirm: true,
    });
    if (error) throw error;
    const id = created!.user!.id;
    const { data: session, error: signInErr } = await anon.auth.signInWithPassword({
      email,
      password: "password-123",
    });
    if (signInErr) throw signInErr;
    return { id, email, token: session!.session!.access_token };
  };

  beforeAll(async () => {
    const { createApp } = await import("../../src/bootstrap");
    app = await createApp();
    await app.listen(0);
    base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;

    admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });

    // 被观察用户：ensureProfile（initial_grant $5）后再造业务数据
    const target = await createUser("insight");
    targetId = target.id;
    targetEmail = target.email;
    targetToken = target.token;
    const me = await get(targetToken, "/api/me");
    if (me.status !== 200) throw new Error(`target /me failed: ${me.status}`);

    // 两个任务：成功图片（扣 60 美分）+ 失败视频（不动账）；created_at 写死错开，倒序断言才稳定
    const { data: okTask, error: t1 } = await admin
      .from("generation_tasks")
      .insert({ user_id: targetId, type: "image", prompt: "洞察页 e2e", status: "succeeded", model_code: "seedream-4.0", cost_cents: 60, created_at: "2026-01-02T00:00:00Z" })
      .select("id")
      .single();
    if (t1) throw t1;
    okTaskId = okTask!.id;
    const { error: t2 } = await admin
      .from("generation_tasks")
      .insert({ user_id: targetId, type: "video", prompt: "洞察页 e2e 失败例", status: "failed", model_code: "dreamina_seedance_45_pro", cost_cents: 0, created_at: "2026-01-01T00:00:00Z" });
    if (t2) throw t2;

    // 账变：预扣 60 + 幂等退款 20（复用 0005 RPC，符号与生产一致）
    const debitOk = await admin.rpc("try_debit_cents", { p_user: targetId, p_cost: 60, p_task: okTaskId });
    if (debitOk.error || debitOk.data !== true) throw new Error("try_debit_cents failed");
    const refundOk = await admin.rpc("refund_cents", { p_user: targetId, p_amount: 20, p_task: okTaskId });
    if (refundOk.error || refundOk.data !== true) throw new Error("refund_cents failed");

    // Agent 会话 / 资产 / 画布项目 / 会话
    const { error: s1 } = await admin.from("agent_sessions").insert({
      user_id: targetId, skill_id: "web_agent_skill_story", prompt: "洞察页 agent", status: "succeeded", budget_cents: 500, spent_cents: 40,
    });
    if (s1) throw s1;
    const { error: a1 } = await admin.from("assets").insert({
      user_id: targetId, kind: "image", storage_key: `insight/${randomUUID()}.png`, url: "https://example.com/x.png", mime: "image/png",
    });
    if (a1) throw a1;
    const { error: p1 } = await admin.from("projects").insert({ user_id: targetId, name: "洞察画布" });
    if (p1) throw p1;
    const { error: c1 } = await admin.from("chats").insert({ user_id: targetId, title: "洞察对话" });
    if (c1) throw c1;

    // 观察者：admin（超级管理员）
    const viewer = await createUser("insightadmin");
    adminId = viewer.id;
    adminEmail = viewer.email;
    adminToken = viewer.token;
    const viewerMe = await get(adminToken, "/api/me");
    if (viewerMe.status !== 200) throw new Error(`viewer /me failed: ${viewerMe.status}`);
    const { error: promoteErr } = await admin.from("profiles").update({ role: "admin" }).eq("id", adminId);
    if (promoteErr) throw promoteErr;
  });

  afterAll(async () => {
    // profiles 及其业务行随 auth.users 级联删除
    await admin.auth.admin.deleteUser(targetId);
    await admin.auth.admin.deleteUser(adminId);
    await app.close();
  });

  describe("AdminGuard（404 隐藏语义）", () => {
    it("普通用户 → 404", async () => {
      expect((await get(targetToken, "/api/admin/insights/users")).status).toBe(404);
      expect((await get(targetToken, `/api/admin/insights/users/${targetId}`)).status).toBe(404);
    });

    it("无 token → 401", async () => {
      const res = await fetch(`${base}/api/admin/insights/users`);
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/admin/insights/users（列表 + 聚合 + 邮箱）", () => {
    it("admin 可见被观察用户行：email/余额/全套统计", async () => {
      const res = await get(adminToken, "/api/admin/insights/users");
      expect(res.status).toBe(200);
      const row = (res.body as any[]).find((u) => u.id === targetId);
      expect(row).toMatchObject({
        email: targetEmail,
        role: "user",
        balance_cents: 460, // 500 - 60 + 20
        stats: STATS_SHAPE,
      });
      const viewerRow = (res.body as any[]).find((u) => u.id === adminId);
      expect(viewerRow?.email).toBe(adminEmail);
    });
  });

  describe("GET /api/admin/insights/users/:id（360° 详情）", () => {
    it("身份 + 统计 + 三段最近记录（按 id 倒序）", async () => {
      const res = await get(adminToken, `/api/admin/insights/users/${targetId}`);
      expect(res.status).toBe(200);
      const body = res.body as any;
      expect(body).toMatchObject({ id: targetId, email: targetEmail, role: "user", balance_cents: 460 });
      expect(body.stats).toMatchObject(STATS_SHAPE);
      expect(body.recent_tasks).toHaveLength(2);
      expect(body.recent_tasks[0]).toMatchObject({ status: "succeeded", cost_cents: 60, model_code: "seedream-4.0" });
      expect(body.recent_agent_sessions).toHaveLength(1);
      expect(body.recent_agent_sessions[0]).toMatchObject({ spent_cents: 40, status: "succeeded" });
      expect(body.recent_ledger).toHaveLength(3);
      expect(body.recent_ledger[0]).toMatchObject({ cents: 20, reason: "generation_refund" });
      expect(body.recent_ledger[1]).toMatchObject({ cents: -60, reason: "generation", task_id: okTaskId });
      expect(body.recent_ledger[2]).toMatchObject({ cents: 500, reason: "initial_grant" });
    });

    it("不存在的用户 → 404", async () => {
      const res = await get(adminToken, `/api/admin/insights/users/${randomUUID()}`);
      expect(res.status).toBe(404);
    });
  });

  describe("RPC admin_user_stats 安全", () => {
    it("anon key 直调被拒（仅 service_role）", async () => {
      const { error } = await anon.rpc("admin_user_stats");
      expect(error?.message).toContain("permission denied");
    });
  });
});
