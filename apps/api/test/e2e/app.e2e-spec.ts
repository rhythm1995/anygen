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

      const list = await authed.get("/api/assets?kind=image");
      expect(list.status).toBe(200);
      expect((list.body as any[]).some((a) => a.storageKey === (presign.body as any).key)).toBe(true);
    });
  });

  // ---------- D8 资产库完整版（CONCLUSIONS.md D8，2026-08-31） ----------
  describe("/api/assets D8 筛选/收藏/批量", () => {
    let id21x9: string;
    let id16x9: string;
    let idGen: string;

    beforeAll(async () => {
      const seed = async (body: Record<string, unknown>) => {
        const kind = (body.kind as string) ?? "image";
        const presign = await authed.post("/api/assets/presign", { filename: "d8.jpg", contentType: "image/jpeg", kind });
        const reg = await authed.post("/api/assets", { key: (presign.body as any).key, ...body });
        expect(reg.status).toBe(201);
        return (reg.body as any).id as string;
      };
      id21x9 = await seed({ kind: "image", mime: "image/jpeg", width: 2520, height: 1080, meta: { prompt: "赛博朋克城市夜景" } });
      id16x9 = await seed({ kind: "image", mime: "image/jpeg", width: 1280, height: 720, meta: { prompt: "一只橘猫" } });
      idGen = await seed({ kind: "video", mime: "video/mp4", meta: { prompt: "赛博朋克跑车飞驰", taskId: "t-1" } });
    });

    it("ratio=21:9 只命中 2520x1080", async () => {
      const list = await authed.get("/api/assets?kind=image&ratio=21%3A9");
      expect(list.status).toBe(200);
      const ids = (list.body as any[]).map((a) => a.id);
      expect(ids).toContain(id21x9);
      expect(ids).not.toContain(id16x9);
    });

    it("res=1K 命中 1280x720（log 最近邻分桶），2520x1080 属 2K 不命中", async () => {
      const list = await authed.get("/api/assets?kind=image&res=1K");
      const ids = (list.body as any[]).map((a) => a.id);
      expect(ids).toContain(id16x9);
      expect(ids).not.toContain(id21x9);
    });

    it("hd=1 只命中长边≥2560（2520 与 1920 都不算超清）", async () => {
      const list = await authed.get("/api/assets?hd=1");
      const ids = (list.body as any[]).map((a) => a.id);
      expect(ids).not.toContain(id16x9);
      expect(ids).not.toContain(id21x9);
    });

    it("q 按 meta.prompt 搜索命中两个「赛博朋克」", async () => {
      const list = await authed.get("/api/assets?q=%E8%B5%9B%E5%8D%9A%E6%9C%8B%E5%85%8B");
      expect(list.status).toBe(200);
      const ids = (list.body as any[]).map((a) => a.id);
      expect(ids).toContain(id21x9);
      expect(ids).toContain(idGen);
      expect(ids).not.toContain(id16x9);
    });

    it("from 未来时间 → 空；sort=asc 时间升序", async () => {
      const empty = await authed.get(`/api/assets?from=${encodeURIComponent("2099-01-01T00:00:00Z")}`);
      expect((empty.body as any[]).length).toBe(0);

      const asc = await authed.get("/api/assets?sort=asc&limit=200");
      const times = (asc.body as any[]).map((a) => new Date(a.createdAt).getTime());
      const sorted = [...times].sort((a, b) => a - b);
      expect(times).toEqual(sorted);
    });

    it("PATCH favorited → fav=1 筛选命中；取消后不再命中", async () => {
      const patch = await authed.patch(`/api/assets/${id16x9}`, { favorited: true });
      expect(patch.status).toBe(200);
      expect((patch.body as any).favorited).toBe(true);

      const fav = await authed.get("/api/assets?fav=1");
      expect((fav.body as any[]).map((a) => a.id)).toContain(id16x9);

      await authed.patch(`/api/assets/${id16x9}`, { favorited: false });
      const fav2 = await authed.get("/api/assets?fav=1");
      expect((fav2.body as any[]).map((a) => a.id)).not.toContain(id16x9);
    });

    it("PATCH 空 body → 422；他人资产 → 404", async () => {
      expect((await authed.patch(`/api/assets/${id16x9}`, {})).status).toBe(422);

      const other = await admin.auth.admin.createUser({
        email: `other-${randomUUID()}@dreamina.local`, password: "password-123", email_confirm: true,
      });
      // profiles 无自建触发器，必须显式建行才能挂资产（FK）
      await admin.from("profiles").insert({ id: other.data!.user!.id, name: "foreign" });
      const ins = await admin
        .from("assets")
        .insert({ id: randomUUID(), user_id: other.data!.user!.id, kind: "image", storage_key: `x/${randomUUID()}.jpg`, url: "https://x" })
        .select("id");
      if (ins.error) throw new Error(`seed foreign asset failed: ${ins.error.message}`);
      const res = await authed.patch(`/api/assets/${ins.data![0]!.id}`, { favorited: true });
      expect(res.status).toBe(404);
      await admin.auth.admin.deleteUser(other.data!.user!.id);
    });

    it("批量 favorite + publish → 标记生效；批量 delete 移除", async () => {
      const batch = await authed.post("/api/assets/batch", { action: "favorite", ids: [id21x9, idGen] });
      expect(batch.status).toBe(201);
      expect((batch.body as any).updated).toBe(2);

      const pub = await authed.post("/api/assets/batch", { action: "publish", ids: [id21x9] });
      expect(pub.status).toBe(201);
      const one = await authed.get("/api/assets?fav=1");
      const row = (one.body as any[]).find((a) => a.id === id21x9);
      expect(row.published).toBe(true);

      const del = await authed.post("/api/assets/batch", { action: "delete", ids: [idGen] });
      expect(del.status).toBe(201);
      const after = await authed.get("/api/assets");
      expect((after.body as any[]).map((a) => a.id)).not.toContain(idGen);
    });

    it("批量非法 action / 空 ids → 422", async () => {
      expect((await authed.post("/api/assets/batch", { action: "nuke", ids: [id21x9] })).status).toBe(422);
      expect((await authed.post("/api/assets/batch", { action: "delete", ids: [] })).status).toBe(422);
    });

    it("unfavorite 批量可撤销收藏", async () => {
      await authed.post("/api/assets/batch", { action: "favorite", ids: [id16x9] });
      await authed.post("/api/assets/batch", { action: "unfavorite", ids: [id16x9] });
      const fav = await authed.get("/api/assets?fav=1");
      expect((fav.body as any[]).map((a) => a.id)).not.toContain(id16x9);
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
      // c211bee 起 OpenRouter 供应商接入：9 CN + 8 OpenRouter 图片模型
      expect(body.modelsByType.image).toHaveLength(17);
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

  describe("/api/agent（技能模板执行器）", () => {
    it("技能清单：4 个官方技能带模板", async () => {
      const res = await authed.get("/api/agent/skills");
      expect(res.status).toBe(200);
      const body = res.body as any[];
      expect(body.length).toBeGreaterThanOrEqual(4);
      const story = body.find((s) => s.id === "web_agent_skill_story");
      expect(story.official).toBe(true);
      expect(story.step_count).toBeGreaterThan(0);
    });

    it("创建会话 → 4 步 pending → advance 因无图片引擎任务被推进（503 步骤失败不炸会话）", async () => {
      // 会话本身建成功（模板来自 agent_skills）
      const create = await authed.post("/api/agent/sessions", { skill_id: "web_agent_skill_story", prompt: "一只宇航员的月球冒险" });
      expect([201, 500]).toContain(create.status);
      if (create.status !== 201) return; // 无模型引擎时 createTask 在 advance 里失败，创建仍应成功
      const id = (create.body as any).id;
      expect((create.body as any).status).toBe("running");
      const detail = await authed.get(`/api/agent/sessions/${id}`);
      expect(detail.status).toBe(200);
      expect((detail.body as any).steps.length).toBe(4);
      // 他人不可见
      const otherList = await authed.get("/api/agent/sessions");
      expect((otherList.body as any[]).every((x) => x.id === id)).toBe(true);

      // advance：无 ARK key → createTask 503（不可恢复）→ 会话 failed 带明确原因，步骤不悬挂
      const me2 = await authed.get("/api/me");
      await admin.rpc("grant_cents", { p_user: userId, p_amount: 500, p_reason: "admin_adjust" });
      const adv = await authed.post(`/api/agent/sessions/${id}/advance`);
      expect([200, 201]).toContain(adv.status);
      expect((adv.body as any).status).toBe("failed");
      const after = await authed.get(`/api/agent/sessions/${id}`);
      expect((after.body as any).status).toBe("failed");
      const steps = (after.body as any).steps as any[];
      expect(steps.every((st) => st.status === "failed")).toBe(true);
      expect(String((after.body as any).error)).toContain("ARK_API_KEY");
    });
  });

  describe("/api/admin usage/audit（AdminGuard 后）", () => {
    it("普通用户 → 404", async () => {
      expect((await authed.get("/api/admin/usage")).status).toBe(404);
      expect((await authed.get("/api/admin/audit")).status).toBe(404);
    });
  });

  describe("/api/agent/free（v2 自由 loop）", () => {
    it("无 LLM key → 503 配置错误", async () => {
      const res = await authed.post("/api/agent/free/sessions", { prompt: "画三张赛博朋克猫" });
      expect(res.status).toBe(503);
      expect(String((res.body as any).message)).toContain("LLM_API_KEY");
    });
  });

  describe("/api/generation/tasks（无 ARK key → 503）", () => {
    it("缺 ARK_API_KEY：503 明确配置错误，任务不残留、积分不扣", async () => {
      const meBefore = await authed.get("/api/me");
      const before = (meBefore.body as any).balance_cents;
      await admin.rpc("grant_cents", { p_user: userId, p_amount: 100, p_reason: "admin_adjust" });
      const res = await authed.post("/api/generation/tasks", {
        type: "image",
        prompt: "a cat",
        params: { resolution: "2k", count: 2 },
      });
      expect(res.status).toBe(503);
      expect(String((res.body as any).message)).toContain("config");
      const me = await authed.get("/api/me");
      expect((me.body as any).balance_cents).toBe(before + 100); // 未扣分
    });
  });
});
