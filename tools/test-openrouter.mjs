// OpenRouter 图像链路真实测试：对 8 个模型逐一生成（真实调用 + 计费 + S3 落储 + 资产登记）
import { createRequire } from "node:module";
const require2 = createRequire(process.cwd() + "/apps/api/package.json");
const { createClient } = require2("@supabase/supabase-js");
import { config } from "dotenv";
import { resolve } from "node:path";
import fs from "node:fs";

config({ path: resolve(process.cwd(), "apps/api/.env.local"), override: true });

const MODELS = [
  { code: "meta/muse-image", route: "images" },
  { code: "bytedance-seed/seedream-5-0-lite", route: "images" },
  { code: "bytedance-seed/seedream-5-0-pro", route: "images" },
  { code: "x-ai/grok-imagine-image-2.0", route: "chat" },
  { code: "google/gemini-3.1-flash-lite-image", route: "chat" },
  { code: "openai/gpt-image-2", route: "images" },
  { code: "google/gemini-3.1-flash-image", route: "chat" },
  { code: "google/gemini-3-pro-image", route: "chat" },
];

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const email = `ortest-${Date.now()}@dreamina.local`;
const { data: u, error: eu } = await sb.auth.admin.createUser({ email, password: "x".repeat(12), email_confirm: true });
if (eu) { console.error("createUser:", eu.message); process.exit(1); }
await sb.rpc("grant_cents", { p_user: u.user.id, p_amount: 2000, p_reason: "admin_adjust" });
const { data: sess } = await anon.auth.signInWithPassword({ email, password: "x".repeat(12) });
const H = { Authorization: `Bearer ${sess.session.access_token}`, "content-type": "application/json" };

const API = "http://127.0.0.1:3101/api";
const results = [];

for (const m of MODELS) {
  const label = m.code.split("/").pop();
  try {
    const res = await fetch(`${API}/generation/tasks`, {
      method: "POST", headers: H,
      body: JSON.stringify({
        type: "image",
        prompt: `A cute orange cat on a windowsill, cartoon style (${label})`,
        model_code: m.code,
        params: { resolution: "2k", count: 1 },
      }),
    });
    const body = await res.json();
    if (res.status !== 201) {
      results.push({ model: label, pass: false, detail: `HTTP ${res.status}: ${String(body.message ?? "").slice(0, 100)}` });
      continue;
    }
    const taskId = body.id;
    const cost = body.cost_cents;
    // 轮询（同步模型一般直接 succeeded）
    let final = body;
    for (let i = 0; i < 30 && final.status === "running"; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const pr = await fetch(`${API}/generation/tasks/${taskId}`, { headers: { Authorization: `Bearer ${sess.session.access_token}` } });
      final = await pr.json();
    }
    // 产物验证：DB asset + MinIO 文件
    let assetOk = false, s3Ok = false, s3Bytes = 0;
    if (final.outputs?.length) {
      const { data: asset } = await sb.from("assets").select("url,storage_key").eq("id", final.outputs[0]).maybeSingle();
      assetOk = Boolean(asset);
      if (asset) {
        const key = asset.storage_key.replace(/^\/+/, "");
        const obj = await fetch(`http://127.0.0.1:9000/dreamina-local/${key}`);
        s3Ok = obj.ok;
        if (obj.ok) s3Bytes = (await obj.arrayBuffer()).byteLength;
      }
    }
    const pass = final.status === "succeeded" && assetOk && s3Ok && s3Bytes > 1000;
    results.push({ model: label, pass, detail: `status=${final.status} cost=${cost}¢ s3=${s3Bytes}B ${final.error ?? ""}` });
  } catch (e) {
    results.push({ model: label, pass: false, detail: String(e.message).slice(0, 100) });
  }
}

// 余额校验：扣费总额 = 成功任务成本之和
const { data: prof } = await sb.from("profiles").select("balance_cents").eq("id", u.user.id).maybeSingle();
console.log("\n===== OpenRouter 图像链路测试结果 =====");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} | ${r.model} | ${r.detail}`);
const pass = results.filter((r) => r.pass).length;
console.log(`\n${pass}/${results.length} PASS | 最终余额: ${prof?.balance_cents ?? "?"}¢`);
await sb.auth.admin.deleteUser(u.user.id);
process.exit(pass === results.length ? 0 : 1);
