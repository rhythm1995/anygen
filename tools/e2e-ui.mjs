// UI e2e：真实浏览器 + 真实输入事件（CDP insertText/mouse），覆盖 登录→首页→生成→画布。
import { systemChromium } from "/Users/bugzhang/.zcode/skills/web-clone/scripts/lib/system-browser.mjs";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const WEB = process.env.WEB_URL ?? "http://localhost:3100";
const exe = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = path.join(ROOT, "docs", "verify");
fs.mkdirSync(OUT, { recursive: true });

const envText = fs.readFileSync(path.join(ROOT, "apps/api/.env.local"), "utf8");
const envGet = (k) => envText.match(new RegExp(`^${k}="?(.*?)"?$`, "m"))?.[1];

const email = `ui-${Date.now()}@dreamina.local`;
const password = "ui-password-123";
const key = envGet("SUPABASE_SERVICE_ROLE_KEY");
const sbUrl = envGet("SUPABASE_URL");
const createRes = await fetch(`${sbUrl}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({ email, password, email_confirm: true }),
});
console.log("user pre-created:", createRes.ok, email);

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const browser = await systemChromium.launch({ executablePath: exe });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => { errors.push(String(e.message).slice(0, 300)); console.log("PAGEERROR:", String(e.message).slice(0, 300)); });
  page.on("console", (m) => { const t = m.text?.() ?? ""; if (t.includes("[auth]")) console.log("PAGE:", t.slice(0, 120)); });

  const clickEl = async (selector) => {
    const rect = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, selector);
    if (!rect) throw new Error(`clickEl: not found ${selector}`);
    await page.mouse.move(rect.x, rect.y);
    await page.mouse.down();
    await page.mouse.up();
  };
  const typeText = async (text) => page.connection.send("Input.insertText", { text });

  // 2. 首页（匿名）
  await page.goto(`${WEB}/ai-tool/home`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(2500);
  await shot(page, "home-anon");

  // 3. 真实 UI 注册登录
  await clickEl('[aria-label="登录"]');
  await page.waitForTimeout(1000);
  await clickEl('[role="dialog"] input[type="email"]');
  await page.waitForTimeout(300);
  await typeText(email);
  await page.waitForTimeout(200);
  await clickEl('[role="dialog"] input[type="password"]');
  await page.waitForTimeout(200);
  await typeText(password);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('[role="dialog"] button')];
    btns.find((b) => /登录$|sign in$/i.test(b.textContent.trim()))?.click();
  });
  await page.waitForTimeout(4000);

  // 4. 首页（登录态，feed 加载）
  await page.goto(`${WEB}/ai-tool/home`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(3500);
  await shot(page, "home-authed");

  // 5. 生成页：真实输入 + 提交
  await page.goto(`${WEB}/ai-tool/generate`, { waitUntil: "load", timeout: 60_000 });
  let composerReady = false;
  for (let i = 0; i < 30; i++) {
    composerReady = await page.evaluate(() => Boolean(document.querySelector('[data-testid="creation-composer"] textarea')));
    if (composerReady) break;
    await page.waitForTimeout(500);
  }
  if (!composerReady) {
    const body = await page.evaluate(() => document.body.innerText.slice(0, 200));
    throw new Error(`composer never appeared. body: ${body}`);
  }
  // 切到图片生成（真实坐标点击，React 19 菜单对 evaluate click 不响应）
  const clickChip = async (patternSource) => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const rect = await page.evaluate((p) => {
        const re = new RegExp(p);
        const el = [...document.querySelectorAll("button")].find((b) => {
          try { return re.test(b.textContent?.replace(/\s+/g, " ").trim() ?? ""); } catch { return false; }
        });
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.y < 0 || r.y > 900 || r.width === 0) return null;
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, patternSource);
      if (rect) {
        await page.mouse.move(rect.x, rect.y); await page.mouse.down(); await page.mouse.up();
        return;
      }
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(OUT, "chip-miss.png") });
    const body = await page.evaluate(() => document.body.innerText.slice(0, 300));
    throw new Error(`chip not found after retries: ${patternSource} | body: ${body.split("\n").join("|").slice(0, 200)}`);
  };
  await clickChip("Agent 模式");
  await page.waitForTimeout(500);
  await clickChip("图片生成");
  await page.waitForTimeout(800);
  // 本机只配 OPENROUTER_API_KEY（无 ARK）：选 Gemini 3.1 Flash 保证真实生成可跑通
  await clickChip("图片 5.0 Pro");
  await page.waitForTimeout(600);
  // 模型列表超长（17 项），弹层内层列表滚到底再选
  await page.evaluate(() => {
    const pop = document.querySelector('[data-testid="creation-composer"] div.absolute.z-50');
    const list = pop?.lastElementChild;
    if (list) list.scrollTop = list.scrollHeight;
  });
  await page.waitForTimeout(300);
  await clickChip("Gemini 3.1 Flash");
  await page.waitForTimeout(600);
  await clickEl('[data-testid="creation-composer"] textarea');
  await typeText("一只霓虹雨夜的东京小巷，电影感镜头");
  await page.waitForTimeout(300);
  await clickChip("1:1 | 2K");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "image-params.png") });
  await clickChip("1:1 | 2K");
  await page.waitForTimeout(300);
  await clickEl('[data-testid="creation-composer"] [aria-label="生成"]');
  // 等真实成图（OpenRouter 即时返回型模型）：核心验收点 = 成功后图片必须出现
  let imageShown = false;
  for (let i = 0; i < 120; i++) {
    imageShown = await page.evaluate(() =>
      Boolean(document.querySelector('[data-testid="task-group"][data-status="succeeded"] img')),
    );
    if (imageShown) break;
    await page.waitForTimeout(1000);
  }
  if (!imageShown) throw new Error("generated image never appeared in feed");
  await page.waitForTimeout(800);
  await shot(page, "generate-submit");

  // 6. 画布入口
  await page.goto(`${WEB}/ai-tool/assets-canvas`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(2000);
  await shot(page, "canvas-entry");

  // 7. 画布编辑器 v2（D12 引擎）：新建项目 → 双击建文本节点 → 自动保存 → 刷新持久化
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    btns.find((b) => b.textContent?.includes("新建项目"))?.click();
  });
  await page.waitForTimeout(4000);
  const editorPath = await page.evaluate(() => location.pathname);
  if (!editorPath.includes("/assets-canvas/project/")) {
    throw new Error(`canvas editor did not open, at ${editorPath}`);
  }
  // 双击画布中央 → 创建节点菜单 → 文本
  await page.evaluate(() => {
    const host = document.querySelector("[data-node-id]")?.parentElement?.parentElement || document.querySelector("main") || document.body;
    const r = (host instanceof Element ? host : document.body).getBoundingClientRect();
    const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) || document.body;
    target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const item = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "文本");
    item?.click();
  });
  await page.waitForTimeout(1200);
  const canvasDbg = await page.evaluate(() => ({
    url: location.pathname,
    nodeCount: document.querySelectorAll("[data-node-id]").length,
    toolbarButtons: [...document.querySelectorAll("header button")].map((b) => b.getAttribute("aria-label") || b.textContent?.trim()).filter(Boolean),
    saveText: document.body.innerText.match(/已保存|保存中|未保存/)?.[0],
    minimap: Boolean(document.querySelector("[class*='rounded-lg border']")),
    zoomText: document.body.innerText.match(/\d+%/)?.[0],
  }));
  console.log("canvas dbg:", JSON.stringify(canvasDbg));
  if (canvasDbg.nodeCount < 1) throw new Error("canvas node was not created");
  // 等自动保存落库
  await page.waitForTimeout(2500);
  const editorUrl = await page.evaluate(() => location.href);
  await page.goto(editorUrl, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(3500);
  const persisted = await page.evaluate(() => document.querySelectorAll("[data-node-id]").length);
  if (persisted < 1) throw new Error("canvas node did not persist after reload");
  console.log("canvas persisted nodes:", persisted);
  await page.evaluate(() => {
    const host = document.querySelector("[data-node-id]")?.parentElement?.parentElement || document.body;
    const r = host.getBoundingClientRect();
    const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) || document.body;
    target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
  });
  await page.waitForTimeout(600);
  await page.connection.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.connection.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  // captureBeyondViewport 有渲染 bug，canvas 页用原生 captureScreenshot
  await page.connection.send("Page.captureScreenshot", { format: "png" }).then((r) => {
    fs.writeFileSync(path.join(OUT, "canvas-editor.png"), Buffer.from(r.data, "base64"));
  });
  console.log("native shot taken");
  console.log("flow complete");
} catch (e) {
  console.error("flow error:", e.message.slice(0, 160));
} finally {
  await browser.close();
}
console.log("page errors:", errors.length);
console.log("done →", OUT);
