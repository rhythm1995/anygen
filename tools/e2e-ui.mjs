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
console.log("will sign up via UI:", email);

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const browser = await systemChromium.launch({ executablePath: exe });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 100)));
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
  await clickEl('[aria-label="Sign in"]');
  await page.waitForTimeout(800);
  await clickEl('[role="dialog"] button.text-center');
  await page.waitForTimeout(400);
  await clickEl('[role="dialog"] input[type="email"]');
  await typeText(email);
  await clickEl('[role="dialog"] input[type="password"]');
  await typeText(password);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('[role="dialog"] button')];
    btns.find((b) => /sign up$/i.test(b.textContent.trim()))?.click();
  });
  await page.waitForTimeout(3000);

  // 4. 首页（登录态，feed 加载）
  await page.goto(`${WEB}/ai-tool/home`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(3500);
  await shot(page, "home-authed");

  // 5. 生成页：真实输入 + 提交
  await page.goto(`${WEB}/ai-tool/generate`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(2000);
  await clickEl('[data-testid="composer"] textarea');
  await typeText("a cinematic shot of a neon-lit Tokyo alley in the rain");
  await page.waitForTimeout(300);
  await clickEl('[aria-label="Generate"]');
  await page.waitForTimeout(3500);
  await shot(page, "generate-submit");

  // 6. 画布入口
  await page.goto(`${WEB}/ai-tool/assets-canvas`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(2000);
  await shot(page, "canvas-entry");

  // 7. 画布编辑器：新建项目 → 加节点 → 自动保存
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    btns.find((b) => b.textContent?.includes("New project"))?.click();
  });
  await page.waitForTimeout(3000);
  await clickEl('header button:nth-of-type(2)');
  await page.waitForTimeout(2500);
  const canvasDbg = await page.evaluate(() => ({
    url: location.pathname,
    reactFlowEl: Boolean(document.querySelector(".react-flow")),
    nodeCount: document.querySelectorAll(".react-flow__node").length,
    toolbar: Boolean(document.querySelector("header")),
    saveText: document.body.innerText.match(/All changes saved|Saving|Unsaved/)?.[0],
    nodeRect: (() => { const n = document.querySelector(".react-flow__node"); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
    vpTransform: document.querySelector(".react-flow__viewport")?.style.transform,
    containerRect: (() => { const c = document.querySelector(".react-flow")?.parentElement; if (!c) return null; const r = c.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
    vpVisibility: (() => { const vp = document.querySelector(".react-flow__viewport"); if (!vp) return null; const cs = getComputedStyle(vp); return { visibility: cs.visibility, opacity: cs.opacity, display: cs.display }; })(),
    nodeVisibility: (() => { const n = document.querySelector(".react-flow__node"); if (!n) return null; const cs = getComputedStyle(n); return { visibility: cs.visibility, opacity: cs.opacity, zIndex: cs.zIndex, bg: cs.backgroundColor, color: cs.color }; })(),
    paneEl: Boolean(document.querySelector(".react-flow__pane")),
    hitTest: (() => { const n = document.querySelector(".react-flow__node"); if (!n) return null; const r = n.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el ? `${el.tagName}.${String(el.className).slice(0, 50)}` : null; })(),
    bgSvg: Boolean(document.querySelector(".react-flow__background")),
    xyflowCss: [...document.styleSheets].some((ss) => (ss.href ?? "").includes("xyflow")),
    rfComputed: (() => { const rf = document.querySelector(".react-flow"); if (!rf) return null; const cs = getComputedStyle(rf); return { pos: cs.position, w: rf.clientWidth, h: rf.clientHeight }; })(),
    nodeComputed: (() => { const n = document.querySelector(".react-flow__node"); if (!n) return null; const cs = getComputedStyle(n); return { pos: cs.position, transform: cs.transform.slice(0, 40), pe: cs.pointerEvents }; })(),
  }));
  console.log("canvas dbg:", JSON.stringify(canvasDbg));
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
