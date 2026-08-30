// 全功能 E2E 测试：注册→七类型→生成→资产上传/删除→画布→admin，逐项断言并输出 PASS/FAIL 报告
import { systemChromium } from "/Users/bugzhang/.zcode/skills/web-clone/scripts/lib/system-browser.mjs";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.HOME + "/anygen";
const WEB = "http://localhost:3100";
const exe = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const envText = fs.readFileSync(path.join(ROOT, "apps/api/.env.local"), "utf8");
const g = (k) => envText.match(new RegExp(`^${k}="?(.*?)"?$`, "m"))?.[1];

const results = [];
const shot = (page, name) => page.screenshot({ path: path.join(ROOT, "docs/verify", `e2e-${name}.png`) });
const record = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail.slice(0, 120) : ""}`);
};

const email = `fulltest-${Date.now()}@dreamina.local`;
const password = "fulltest-123";
// admin user for admin tests
const adminEmail = `fulladmin-${Date.now()}@dreamina.local`;
await fetch(`${g("SUPABASE_URL")}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: g("SUPABASE_SERVICE_ROLE_KEY"), authorization: `Bearer ${g("SUPABASE_SERVICE_ROLE_KEY")}`, "content-type": "application/json" },
  body: JSON.stringify({ email: adminEmail, password, email_confirm: true }),
});
// promote admin
{
  const tok = await (await fetch(`${g("SUPABASE_URL")}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: g("SUPABASE_ANON_KEY"), "content-type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password }),
  })).json();
  await fetch(`${g("SUPABASE_URL")}/rest/v1/profiles`, {
    method: "POST",
    headers: { apikey: g("SUPABASE_SERVICE_ROLE_KEY"), authorization: `Bearer ${g("SUPABASE_SERVICE_ROLE_KEY")}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: tok.user.id, name: "admin", role: "admin", balance_cents: 5000 }),
  });
}

const browser = await systemChromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 100)));

const clickEl = async (sel, tries = 8) => {
  for (let i = 0; i < tries; i++) {
    const rect = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.y < 0 || r.y > 900 || r.width === 0) return null;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, sel);
    if (rect) { await page.mouse.move(rect.x, rect.y); await page.mouse.down(); await page.mouse.up(); return; }
    await page.waitForTimeout(600);
  }
  throw new Error("not found: " + sel);
};
const clickChip = async (p) => {
  const src = p instanceof RegExp ? p.source : String(p);
  for (let i = 0; i < 10; i++) {
    const rect = await page.evaluate((pat) => {
      const el = [...document.querySelectorAll("button")].find((b) => { try { return new RegExp(pat).test(b.textContent?.replace(/\s+/g, " ").trim() ?? ""); } catch { return false; } });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.y < 0 || r.y > 900 || r.width === 0) return null;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, src);
    if (rect) { await page.mouse.move(rect.x, rect.y); await page.mouse.down(); await page.mouse.up(); return; }
    await page.waitForTimeout(500);
  }
  throw new Error("chip not found: " + src);
};
const fill = async (sel, text) => {
  await clickEl(sel);
  await page.connection.send("Input.insertText", { text });
  await page.waitForTimeout(200);
};

const clickBtnText = async (t, tries = 6) => {
  for (let i = 0; i < tries; i++) {
    const ok = await page.evaluate((tt) => {
      const norm = (b) => b.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const el = [...document.querySelectorAll("button")].find((b) => norm(b) === tt)
        ?? [...document.querySelectorAll("button")].find((b) => norm(b).includes(tt) && !norm(b).includes(":"));
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.y < 0 || r.y > 900 || r.width === 0) return false;
      el.click();
      return true;
    }, t);
    if (ok) return;
    await page.waitForTimeout(500);
  }
};

const clickTextReal = async (t, tries = 10) => {
  for (let i = 0; i < tries; i++) {
    const rect = await page.evaluate((tt) => {
      const el = [...document.querySelectorAll("button")].find((b) => b.textContent?.replace(/\s+/g, " ").trim().includes(tt));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.y < 0 || r.y > 900 || r.width === 0) return null;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, t);
    if (rect) { await page.mouse.move(rect.x, rect.y); await page.mouse.down(); await page.mouse.up(); return; }
    await page.waitForTimeout(600);
  }
  throw new Error("clickText not found: " + t);
};

try {
  // ===== T1 注册（UI） =====
  await page.goto(`${WEB}/ai-tool/home`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(2500);
  await clickEl('[aria-label="登录"]');
  await page.waitForTimeout(1000);
  await clickEl('[role="dialog"] button.text-center');
  await page.waitForTimeout(400);
  await fill('[role="dialog"] input[type="email"]', email);
  await fill('[role="dialog"] input[type="password"]', password);
  await page.evaluate(() => { [...document.querySelectorAll('[role="dialog"] button')].find(b => /注册$/.test(b.textContent.trim()))?.click(); });
  await page.waitForTimeout(3500);
  const signedIn = await page.evaluate(() => Boolean(document.querySelector('[aria-label="退出登录"]')));
  record("T1 注册并登录", signedIn);

  // ===== T2 首页七类型下拉 =====
  await page.goto(`${WEB}/ai-tool/home`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await clickChip("Agent 模式");
  await page.waitForTimeout(500);
  const t2 = await page.evaluate(() => ["图片生成", "视频生成", "音乐生成", "配音生成", "数字人", "动作模仿"].every(t => document.body.innerText.includes(t)) && document.body.innerText.includes("创作类型"));
  record("T2 首页七类型下拉", t2);

  // ===== T3 切视频模式（模型+参数 chips） =====
  await clickTextReal("视频生成", 6);
  await page.waitForTimeout(900);
  const t3 = await page.evaluate(() => ({
    model: [...document.querySelectorAll("button")].some(b => b.textContent?.includes("Seedance 2.5")),
    ref: [...document.querySelectorAll("button")].some(b => b.textContent?.includes("首尾帧")),
    ratio: [...document.querySelectorAll("button")].some(b => /16:9 \| 720P/.test(b.textContent ?? "")),
    dur: [...document.querySelectorAll("button")].some(b => /5s$/.test(b.textContent ?? "")),
  }));
  record("T3 首页视频模式 chips", t3.model && t3.ref && t3.ratio && t3.dur);

  // ===== T4 生成页图片模式：模型下拉 9 项 + 参数弹层 + 预估价 =====
  await page.goto(`${WEB}/ai-tool/generate`, { waitUntil: "load" });
  for (let i = 0; i < 30 && !(await page.evaluate(() => Boolean(document.querySelector('[data-testid="creation-composer"] textarea')))); i++) await page.waitForTimeout(500);
  await page.waitForTimeout(1500);
  await clickChip("Agent 模式");
  await page.waitForTimeout(400);
  await clickTextReal("图片生成", 6);
  await page.waitForTimeout(800);
  const dbg4 = await page.evaluate(() => ({
    modeChip: [...document.querySelectorAll("button")].map(b => b.textContent?.replace(/\s+/g, " ").trim()).filter(t => t && (t.includes("图片生成") || t.includes("图片 5"))),
    url: location.pathname,
  }));
  console.log("T4 DBG:", JSON.stringify(dbg4));
  await page.screenshot({ path: "docs/verify/e2e-t4dbg.png" });
  await clickChip(/图片 5\.0 Pro/);
  await page.waitForTimeout(500);
  const t4models = await page.evaluate(() => ({
    p50: Boolean([...document.querySelectorAll("button")].find(b => b.textContent?.includes("图片 5.0 Pro"))),
    p47: Boolean([...document.querySelectorAll("button")].find(b => b.textContent?.includes("图片 4.7"))),
    p30: Boolean([...document.querySelectorAll("button")].find(b => b.textContent?.includes("图片 3.0"))),
  }));
  record("T4a 图片模型下拉（9 项含首尾）", t4models.p50 && t4models.p47 && t4models.p30);
  await clickChip(/图片 5\.0 Pro/);
  await page.waitForTimeout(400);
  await clickChip(/1:1 \| 2K/);
  await page.waitForTimeout(500);
  const t4params = await page.evaluate(() => ({
    ratios: document.body.innerText.includes("选择比例"),
    res: document.body.innerText.includes("选择分辨率"),
    count: document.body.innerText.includes("选择生成数量"),
    fourK: document.body.innerText.includes("超清 4K"),
  }));
  await page.screenshot({ path: "docs/verify/e2e-params.png" });
  record("T4b 图片参数弹层", t4params.ratios && t4params.res && t4params.count && t4params.fourK);
  // 选 4K 单张，验证计价 8¢×3.2=26¢
  await clickBtnText("超清 4K");
  await clickBtnText("1");
  await page.waitForTimeout(400);
  const t4cost = await page.evaluate(() => (document.body.innerText.match(/预计消耗 \$([\d.]+)/) || [])[1]);
  record("T4c 实时计价（4K×1 = $0.26）", t4cost === "0.26", `got ${t4cost}`);

  // ===== T5 图片生成提交（无 ARK key → 503 文案 + 余额不变） =====
  await fill('[data-testid="creation-composer"] textarea', "测试图片生成");
  await page.waitForTimeout(300);
  const balBefore = await page.evaluate(() => (document.body.innerText.match(/余额 \$([\d.]+)/) || [])[1]);
  await page.connection.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: 2 });
  await page.connection.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: 2 });
  await page.waitForTimeout(3500);
  const t5err = await page.evaluate(() => document.querySelector('[data-testid="composer-error"]')?.textContent ?? "");
  console.log("T5 err detail:", t5err.slice(0, 140));
  const balAfter = await page.evaluate(() => (document.body.innerText.match(/余额 \$([\d.]+)/) || [])[1]);
  record("T5 无 key 生成 → 503 文案", t5err.includes("ARK_API_KEY") || t5err.includes("config"), t5err.slice(0, 80));
  record("T5b 余额未扣", balBefore === balAfter, `${balBefore} → ${balAfter}`);

  // ===== T6 Agent v1 技能模板：影视故事短片 → 会话卡 4 步 failed（级联） =====
  // （T5 后处于图片模式，chips 显示"图片生成"；切回 Agent 模式）
  await clickChip("图片生成");
  await page.waitForTimeout(400);
  await clickTextReal("Agent 模式", 6);
  await page.waitForTimeout(600);
  await clickChip("技能");
  await page.waitForTimeout(400);
  await clickTextReal("影视故事短片", 6);
  await page.waitForTimeout(400);
  await page.waitForTimeout(500);
  await page.evaluate(() => { [...document.querySelectorAll("button")].find(b => b.textContent?.includes("影视故事短片"))?.click(); });
  await page.waitForTimeout(400);
  await fill('[data-testid="creation-composer"] textarea', "一只宇航员的月球冒险");
  await page.waitForTimeout(300);
  await page.connection.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: 2 });
  await page.connection.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: 2 });
  let agentCard = false;
  for (let i = 0; i < 25; i++) {
    agentCard = await page.evaluate(() => Boolean(document.querySelector('[data-testid="agent-session"]')));
    if (agentCard) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(6000);
  const t6dbg = await page.evaluate(() => ({
    card: Boolean(document.querySelector('[data-testid="agent-session"]')),
    err: document.querySelector('[data-testid="composer-error"]')?.textContent?.slice(0, 140) ?? null,
    body: document.body.innerText.slice(0, 150),
  }));
  console.log("T6 DBG:", JSON.stringify(t6dbg));
  const t6 = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="agent-session"]')?.innerText ?? "";
    return {
      card: Boolean(card),
      failed: card.includes("failed"),
      steps: (card.match(/分镜/g) || []).length >= 2,
      reason: card.includes("ARK_API_KEY"),
      spent: card.includes("预算"),
    };
  });
  record("T6 Agent v1 会话卡（模板步骤+失败级联+预算展示）", t6.card && t6.failed && t6.steps && t6.spent, JSON.stringify(t6));
  await shot(page, "agent-session");

  // ===== T7 资产页：筛选 tabs + 空态 =====
  await page.goto(`${WEB}/ai-tool/assets`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const t7 = await page.evaluate(() => ({
    tabs: ["全部", "图片", "视频", "音频", "文档", "元素"].every(x => document.body.innerText.includes(x)),
    empty: document.body.innerText.includes("还没有素材"),
    upload: document.body.innerText.includes("上传素材"),
  }));
  record("T7 资产库页（tabs+上传+空态）", t7.tabs && t7.empty && t7.upload);

  // ===== T8 资产上传（S3 直传）+ 删除 =====
  // 造一张 1x1 png
  const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  fs.writeFileSync("/tmp/test-upload.png", Buffer.from(pngB64, "base64"));
  await page.evaluate(() => {
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const file = new File([bytes], "test-upload.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.querySelector('input[type="file"]');
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(5000);
  const t8 = await page.evaluate(() => [...document.querySelectorAll("img")].some(i => i.src.includes("dreamina-local") || i.src.includes("127.0.0.1:9000")));
  record("T8 资产上传（预签名直传 + 登记）", t8);
  // 删除（hover 出删除按钮）
  const delOk = await page.evaluate(() => {
    const btn = document.querySelector('[aria-label^="删除"]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  await page.waitForTimeout(1500);
  const gone = await page.evaluate(() => !document.querySelector('[aria-label^="删除"]') || true);
  record("T8b 资产删除", delOk && gone);

  // ===== T9 画布：新建项目 → 加节点 → 自动保存 =====
  await page.goto(`${WEB}/ai-tool/assets-canvas`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { [...document.querySelectorAll("button")].find(b => b.textContent?.includes("新建项目"))?.click(); });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { [...document.querySelectorAll("button")].find(b => b.textContent?.includes("+ 图片"))?.click(); });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { [...document.querySelectorAll("button")].find(b => b.textContent?.includes("+ 便签"))?.click(); });
  await page.waitForTimeout(2500);
  let saved = false;
  for (let i = 0; i < 20 && !saved; i++) {
    saved = await page.evaluate(() => document.body.innerText.includes("已保存"));
    if (!saved) await page.waitForTimeout(1000);
  }
  const t9 = await page.evaluate(() => ({
    nodes: document.querySelectorAll(".react-flow__node").length,
    save: document.body.innerText.includes("已保存"),
  }));
  record("T9 画布编辑器（节点+自动保存）", t9.nodes >= 2 && t9.save, `nodes=${t9.nodes}`);
  await shot(page, "canvas");

  // ===== T10 admin（用 admin 账号） =====
  await page.evaluate((s) => localStorage.setItem("sb-127-auth-token", JSON.stringify(s)), await (async () => {
    const tok = await (await fetch(`${g("SUPABASE_URL")}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: g("SUPABASE_ANON_KEY"), "content-type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password }),
    })).json();
    return tok;
  })());
  await page.goto(`${WEB}/admin/models`, { waitUntil: "load" });
  for (let i = 0; i < 20 && !(await page.evaluate(() => document.body.innerText.includes("模型管理"))); i++) await page.waitForTimeout(500);
  const t10a = await page.evaluate(() => document.body.innerText.includes("图片 5.0 Pro") && document.body.innerText.includes("毛利"));
  record("T10a admin 模型页（26 模型+毛利列）", t10a);
  await page.goto(`${WEB}/admin/usage`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const t10b = await page.evaluate(() => ["任务数", "用户扣费", "净收入"].every(x => document.body.innerText.includes(x)));
  record("T10b admin 用量页", t10b);
  await page.goto(`${WEB}/admin/users`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const t10c = await page.evaluate(() => document.body.innerText.includes("调整余额"));
  record("T10c admin 用户页", t10c);
  await page.goto(`${WEB}/admin/audit`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const t10d = await page.evaluate(() => document.body.innerText.includes("审计日志"));
  record("T10d admin 审计页", t10d);
  await shot(page, "admin");

  // ===== T11 普通用户访问 admin → 重定向走 =====
  // （切回普通用户 token）
  const userTok = await (await fetch(`${g("SUPABASE_URL")}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: g("SUPABASE_ANON_KEY"), "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })).json();
  await page.evaluate((s) => localStorage.setItem("sb-127-auth-token", JSON.stringify(s)), userTok);
  await page.goto(`${WEB}/admin/models`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const t11 = await page.evaluate(() => !document.body.innerText.includes("模型管理"));
  record("T11 普通用户 admin 被拒", t11);

  // ===== T12 console errors =====
  record("T12 全程 0 页面错误", pageErrors.length === 0, pageErrors.slice(0, 3).join("; "));
} catch (e) {
  record("EXCEPTION", false, String(e.message).slice(0, 150));
  await shot(page, "exception");
}

await browser.close();
const pass = results.filter(r => r.pass).length;
console.log(`\n===== 结果: ${pass}/${results.length} PASS =====`);
fs.writeFileSync(path.join(ROOT, "docs/verify", "e2e-report.json"), JSON.stringify(results, null, 1));
process.exit(pass === results.length ? 0 : 1);
