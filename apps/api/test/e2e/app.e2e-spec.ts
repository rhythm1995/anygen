/**
 * API e2e —— 真实本地 Supabase + 完整 Nest app（原生 fetch，绕开 supertest interop 怪癖）。
 * 覆盖 docs/TESTING.md #7 feed 分页、#8 projects/chats，另含 me/assets/generation 契约。
 */
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "node:path";
import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

dotenvConfig({ path: resolve(__dirname, "../../.env.local"), override: true });

describe("Dreamina API (e2e)", () => {
  let app: INestApplication;
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let userId: string;
  let token: string;
  let email: string;
  let base = "";

  const authed = {
    get: (url: string) =>
      fetch(`${base}${url}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json().then((body) => ({ status: r.status, body }))),
    post: (url: string, body?: unknown) =>
      fetch(`${base}${url}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }).then((r) => r.json().then((b) => ({ status: r.status, body: b }))),
    patch: (url: string, body?: unknown) =>
      fetch(`${base}${url}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json().then((b) => ({ status: r.status, body: b }))),
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

    email = `e2e-${randomUUID()}@dreamina.local`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: "password-123",
      email_confirm: true,
    });
    if (error) throw error;
    userId = created!.user!.id;
    const { data: session, error: signInErr } = await anon.auth.signInWithPassword({
      email,
      password: "password-123",
    });
    if (signInErr) throw signInErr;
    token = session!.session!.access_token;
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(userId);
    await app.close();
  });

  describe("auth", () => {
    it("无 token → 401（feed 是私有数据）", async () => {
      const res = await fetch(`${base}/api/feed`);
      expect(res.status).toBe(401);
    });

    it("假 token → 401", async () => {
      const res = await fetch(`${base}/api/feed`, { headers: { Authorization: "Bearer fake.token" } });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/feed", () => {
    it("默认分页：20 条 + has_more（seed 44 条）", async () => {
      const res = await authed.get("/api/feed");
      expect(res.status).toBe(200);
      expect((res.body as any).items).toHaveLength(20);
      expect((res.body as any).hasMore).toBe(true);
    });

    it("offset 翻页到空尾", async () => {
      const page1 = await authed.get("/api/feed?offset=0");
      expect(page1.status).toBe(200);
      expect((page1.body as any).items.length).toBeGreaterThan(0);

      // 翻页直到尽
      let offset = 0;
      let pages = 0;
      let last: any;
      for (;;) {
        last = await authed.get(`/api/feed?offset=${offset}`);
        pages++;
        if (!(last.body as any).hasMore) break;
        offset = (last.body as any).nextOffset;
        expect(pages).toBeLessThan(10); // 防死循环
      }
      expect((last.body as any).hasMore).toBe(false);
      expect((last.body as any).items.length).toBeLessThan(20); // 尾页不满
    });

    it("offset 越界 → 空数组不报错", async () => {
      const res = await authed.get("/api/feed?offset=99999");
      expect(res.status).toBe(200);
      expect((res.body as any).items).toEqual([]);
      expect((res.body as any).hasMore).toBe(false);
    });
  });

  describe("GET /api/me", () => {
    it("首次访问自动建 profile，积分结构完整", async () => {
      const res = await authed.get("/api/me");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: userId,
        role: "user",
        // 开通赠送 $5.00（INITIAL_GRANT_CENTS，CONCLUSIONS D2：内部使用无注册赠金语义）
        balance_cents: 500,
      });
    });
  });

  describe("/api/projects", () => {
    let projectId: string;

    it("create 默认名 New project + 空 graph", async () => {
      const res = await authed.post("/api/projects", {});
      expect(res.status).toBe(201);
      expect((res.body as any).name).toBe("New project");
      expect((res.body as any).graph).toEqual({ nodes: [], edges: [] });
      projectId = (res.body as any).id;
    });

    it("patch graph：合法 xyflow 结构落库", async () => {
      const graph = {
        nodes: [
          { id: "a", type: "image", position: { x: 0, y: 0 }, data: { url: "/seed/feed/x.jpg", width: 100, height: 100 } },
          { id: "b", type: "text", position: { x: 10, y: 10 }, data: { text: "note" } },
        ],
        edges: [{ id: "e", source: "a", target: "b" }],
        viewport: { x: 0, y: 0, zoom: 1 },
      };
      const res = await authed.patch(`/api/projects/${projectId}`, { graph, name: "My board" });
      expect(res.status).toBe(200);
      expect((res.body as any).name).toBe("My board");
      expect((res.body as any).graph.nodes).toHaveLength(2);
    });

    it("patch graph：非法节点类型 → 422", async () => {
      const graph = { nodes: [{ id: "x", type: "hacker", position: { x: 0, y: 0 }, data: {} }], edges: [] };
      const res = await authed.patch(`/api/projects/${projectId}`, { graph });
      expect(res.status).toBe(422);
    });

    it("他人项目不可见", async () => {
      const other = await admin.auth.admin.createUser({
        email: `other-${randomUUID()}@dreamina.local`,
        password: "password-123",
        email_confirm: true,
      });
      await admin.from("projects").insert({ id: randomUUID(), user_id: other.data!.user!.id, name: "secret" });
      const list = await authed.get("/api/projects");
      expect(list.status).toBe(200);
      expect((list.body as any[]).some((p) => p.name === "secret")).toBe(false);
      await admin.auth.admin.deleteUser(other.data!.user!.id);
    });
  });

  describe("/api/chats", () => {
    it("create 默认 New chat → 发消息 → 列表", async () => {
      const chat = await authed.post("/api/chats", {});
      expect(chat.status).toBe(201);
      expect((chat.body as any).title).toBe("New chat");

      const msg = await authed.post(`/api/chats/${(chat.body as any).id}/messages`, { role: "user", content: "画一只猫" });
      expect(msg.status).toBe(201);

      const list = await authed.get("/api/chats");
      expect(list.status).toBe(200);
      expect((list.body as any[]).length).toBeGreaterThan(0);

      const messages = await authed.get(`/api/chats/${(chat.body as any).id}/messages`);
      expect((messages.body as any[]).length).toBe(1);
      expect((messages.body as any[])[0]?.content).toBe("画一只猫");
    });

    it("非法 role → 422", async () => {
      const chat = await authed.post("/api/chats", {});
      const res = await authed.post(`/api/chats/${(chat.body as any).id}/messages`, { role: "system", content: "x" });
      expect(res.status).toBe(422);
    });
  });

  describe("/api/assets", () => {
    it("presign：返回直传地址 + key", async () => {
      const res = await authed.post("/api/assets/presign", { filename: "shot.png", contentType: "image/png", kind: "image" });
      expect(res.status).toBe(201);
      expect((res.body as any).key).toMatch(/^image\/.+\.png$/);
      expect((res.body as any).publicUrl).toContain("dreamina-local");
      expect((res.body as any).expiresIn).toBeGreaterThan(0);
    });

    it("登记 + 按类型筛选", async () => {
      const presign = await authed.post("/api/assets/presign", { filename: "a.jpg", contentType: "image/jpeg", kind: "image" });
      const reg = await authed.post("/api/assets", { key: (presign.body as any).key, kind: "image", mime: "image/jpeg", width: 10, height: 10 });
      expect(reg.status).toBe(201);

      const list = await authed.get("/api/assets?type=image");
      expect(list.status).toBe(200);
      expect((list.body as any[]).some((a) => a.storageKey === (presign.body as any).key)).toBe(true);
    });
  });

  describe("GET /api/config/creation-types", () => {
    it("返回 7 类型 + 图片 9 模型 + 视频 11 模型（admin models 表驱动）", async () => {
      const res = await authed.get("/api/config/creation-types");
      expect(res.status).toBe(200);
      const body = res.body as any;
      expect(body.modes).toHaveLength(7);
      expect(body.modes.map((m: any) => m.label)).toEqual([
        "Agent 模式", "图片生成", "视频生成", "音乐生成", "配音生成", "数字人", "动作模仿",
      ]);
      expect(body.modelsByType.image).toHaveLength(9);
      expect(body.modelsByType.video).toHaveLength(11);
      const pro = body.modelsByType.image.find((m: any) => m.code === "high_aes_general_v50p_large");
      expect(pro.is_default).toBe(true);
      expect(pro.params.resolutions["2k"].map.sizes).toHaveLength(8);
      const s25 = body.modelsByType.video.find((m: any) => m.code === "dreamina_seedance_45_pro");
      expect(s25.params.aspect_ratio.options).toContain("16:9");
      expect(s25.params.resolution.options).toContain("1080p");
      expect(s25.params.duration_ms).toEqual({ min_duration_ms: 4000, max_duration_ms: 15000 });
    });
  });

  describe("/api/admin（AdminGuard）", () => {
    it("普通用户访问 → 404（不暴露路由）", async () => {
      const res = await authed.get("/api/admin/models");
      expect(res.status).toBe(404);
    });
  });

  describe("/api/generation/tasks（无 ARK key → 503）", () => {
    it("缺 ARK_API_KEY：503 明确配置错误，任务不残留、积分不扣", async () => {
      await admin.rpc("grant_cents", { p_user: userId, p_amount: 100, p_reason: "admin_adjust" });
      const res = await authed.post("/api/generation/tasks", {
        type: "image",
        prompt: "a cat",
        params: { resolution: "2k", count: 2 },
      });
      expect(res.status).toBe(503);
      expect(String((res.body as any).message)).toContain("config");
      const me = await authed.get("/api/me");
      expect((me.body as any).balance_cents).toBe(600); // 500 初始 + 100 未扣分
    });
  });
});
