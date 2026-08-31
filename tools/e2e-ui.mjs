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

  // 8. 画布内生成闭环（真实 /generation/tasks 计费管线）
  await page.connection.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.connection.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.waitForTimeout(400);
  const dbgDbl = await page.evaluate(() => {
    const host = document.querySelector("[data-node-id]")?.parentElement?.parentElement || document.body;
    const r = host.getBoundingClientRect();
    // 找一个绝对空白的点：避开所有节点与 UI 停靠区
    const candidates = [
      { x: r.x + r.width * 0.85, y: r.y + r.height * 0.2 },
      { x: r.x + r.width * 0.1, y: r.y + r.height * 0.2 },
      { x: r.x + r.width * 0.85, y: r.y + r.height * 0.5 },
      { x: r.x + r.width * 0.5, y: r.y + r.height * 0.85 },
    ];
    for (const spot of candidates) {
      const target = document.elementFromPoint(spot.x, spot.y);
      if (!target?.closest?.("[data-node-id],[data-connection-id],button,input,textarea,[data-canvas-no-zoom]")) {
        target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: spot.x, clientY: spot.y }));
        return { ok: true, x: Math.round(spot.x), y: Math.round(spot.y), tag: target.tagName };
      }
    }
    return { ok: false };
  });
  console.log("dblclick dbg:", JSON.stringify(dbgDbl));
  if (!dbgDbl.ok) throw new Error("no empty canvas spot found for dblclick");
  await page.waitForTimeout(700);
  const menuOk = await page.evaluate(() => {
    const item = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "生成配置");
    item?.click();
    return Boolean(item);
  });
  if (!menuOk) throw new Error("node create menu did not open (dblclick hit an existing node?)");
  await page.waitForTimeout(1500);
  const panelOk = await page.evaluate(() => Boolean([...document.querySelectorAll("textarea")].find((t) => (t.placeholder || "").includes("组装提示词"))));
  if (!panelOk) throw new Error("config node panel did not render");
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("textarea")].find((t) => (t.placeholder || "").includes("组装提示词"));
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, "一只橘猫在窗台上看雨，水墨风格");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(800);
  // 8a. 无 key 路径：默认 Ark 模型 → 503 文案显示在节点 error 横幅（D12：禁 mock，如实展示）
  const firstClick = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("开始生成"));
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  });
  if (!firstClick) throw new Error("开始生成 (default model) missing or disabled");
  const errShown = await (async () => {
    const start = Date.now();
    while (Date.now() - start < 20_000) {
      await page.waitForTimeout(1500);
      const hit = await page.evaluate(() => {
        const banner = [...document.querySelectorAll("[data-node-id]")].find((n) => n.textContent?.includes("Provider config missing") || n.textContent?.includes("ARK_API_KEY") || n.textContent?.includes("generation provider unavailable"));
        return Boolean(banner);
      });
      if (hit) return true;
    }
    return false;
  })();
  if (!errShown) throw new Error("503 provider-missing error not shown on config node");
  console.log("canvas 503 path verified (honest error shown)");

  // 8b. 完整闭环：切到 OpenRouter 可用模型（本环境 Gemini）→ 真实计费生成 → 图片节点落画布
  await page.evaluate(() => {
    const trigger = [...document.querySelectorAll("[data-node-id] button[role='combobox']")][0];
    trigger?.click();
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const options = [...document.querySelectorAll("[role='option']")];
    const gemini = options.find((o) => /gemini/i.test(o.textContent ?? ""));
    (gemini ?? options[options.length - 1])?.click();
  });
  await page.waitForTimeout(500);
  const genClicked = await page.evaluate(() => {
    const of = window.fetch;
    window.__genLog = [];
    window.fetch = async (...args) => {
      const res = await of(...args);
      const url = String(args[0]);
      if (url.includes("/generation/tasks")) {
        res.clone().text().then((t) => window.__genLog.push({ url: url.slice(0, 80), method: String(args[1]?.method ?? "GET"), status: res.status, body: t.slice(0, 800) })).catch(() => {});
      }
      return res;
    };
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("开始生成"));
    if (!btn) return "missing";
    if (btn.disabled) return "disabled";
    btn.click();
    return true;
  });
  if (genClicked !== true) {
    const dbg = await page.evaluate(() => [...document.querySelectorAll("[data-node-id]")].map((n) => n.textContent?.slice(0, 60)));
    throw new Error(`开始生成 button ${genClicked}; nodes: ${JSON.stringify(dbg)}`);
  }
  const genStart = Date.now();
  let genDone = false;
  let genErr = null;
  while (Date.now() - genStart < 150_000) {
    await page.waitForTimeout(5000);
    const state = await page.evaluate(() => {
      const logs = window.__genLog ?? [];
      const badPost = logs.find((l) => l.method === "POST" && l.status >= 400);
      return {
        imgNode: [...document.querySelectorAll("[data-node-id] img")].some((i) => (i.src || "").startsWith("http")),
        retryBtn: [...document.querySelectorAll("[data-node-id]")].some((n) => n.textContent?.includes("重试")),
        badPost: badPost ? { status: badPost.status, body: badPost.body } : null,
      };
    });
    if (state.imgNode) { genDone = true; break; }
    if (state.badPost) { genErr = JSON.stringify(state.badPost); break; }
    if (state.retryBtn) { genErr = "node error state"; break; }
  }
  if (genErr) {
    const errDetail = await page.evaluate(() => [...document.querySelectorAll("[data-node-id]")].map((n) => n.textContent?.slice(0, 80)));
    throw new Error(`canvas generation errored: ${genErr}; nodes: ${JSON.stringify(errDetail)}`);
  }
  if (!genDone) {
    const nodesDump = await page.evaluate(() => [...document.querySelectorAll("[data-node-id]")].map((n) => n.textContent?.slice(0, 80)));
    const genLog = await page.evaluate(() => window.__genLog ?? []);
    const saveText = await page.evaluate(() => document.body.innerText.match(/已保存|保存中|未保存/)?.[0]);
    throw new Error(`canvas generation did not complete in 150s (save=${saveText}); fetchLog: ${JSON.stringify(genLog).slice(0, 800)}; nodes: ${JSON.stringify(nodesDump)}`);
  }
  console.log("canvas generation done in", Math.round((Date.now() - genStart) / 1000), "s");
  await page.waitForTimeout(3000); // 等自动保存落库
  await shot(page, "canvas-generation");

  // 9. 画布 Agent 对话侧栏（Phase C）：开面板 → 发消息 → 如实回复或 503 文案
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "对话")?.click();
  });
  await page.waitForTimeout(800);
  const agentPanelOk = await page.evaluate(() => Boolean([...document.querySelectorAll("textarea")].find((t) => (t.placeholder || "").includes("创作目标"))));
  if (!agentPanelOk) throw new Error("assistant panel did not open");
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("textarea")].find((t) => (t.placeholder || "").includes("创作目标"));
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, "你好，介绍一下你能做什么");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "发送")?.click();
  });
  const replyStart = Date.now();
  let agentDone = false;
  while (Date.now() - replyStart < 60_000) {
    await page.waitForTimeout(3000);
    agentDone = await page.evaluate(() => {
      const bubbles = [...document.querySelectorAll("aside div.whitespace-pre-wrap")];
      const assistant = bubbles.filter((b) => b.textContent && b.textContent.length > 8);
      return assistant.length > 0;
    });
    if (agentDone) break;
  }
  if (!agentDone) throw new Error("canvas agent did not reply (or show honest error) in 60s");
  await shot(page, "canvas-agent");
  console.log("canvas agent replied");
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
