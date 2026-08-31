// D11 验证：首页能力卡（2 张 + 联动）+ 视频面板比例弹层尺寸截图
import { systemChromium } from "/Users/bugzhang/.zcode/skills/web-clone/scripts/lib/system-browser.mjs";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WEB = "http://localhost:3100";
const OUT = path.join(ROOT, "docs", "verify");
const exe = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const email = `d11-${Date.now()}@dreamina.local`;
const password = "ui-password-123";

const envText = fs.readFileSync(path.join(ROOT, "apps/api/.env.local"), "utf8");
const envGet = (k) => envText.match(new RegExp(`^${k}="?(.*?)"?$`, "m"))?.[1];
await fetch(`${envGet("SUPABASE_URL")}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: envGet("SUPABASE_SERVICE_ROLE_KEY"), authorization: `Bearer ${envGet("SUPABASE_SERVICE_ROLE_KEY")}`, "content-type": "application/json" },
  body: JSON.stringify({ email, password, email_confirm: true }),
});

const browser = await systemChromium.launch({ executablePath: exe });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 100)));
  const clickEl = async (selector) => {
    const rect = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, selector);
    if (!rect) throw new Error("not found " + selector);
    await page.mouse.move(rect.x, rect.y); await page.mouse.down(); await page.mouse.up();
  };
  const clickText = async (text) => {
    const rect = await page.evaluate((t) => {
      const el = [...document.querySelectorAll("button, span, div")].find((n) =>
        [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim() === t) && n.getBoundingClientRect().width > 0);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, text);
    if (!rect) throw new Error("text not found " + text);
    await page.mouse.move(rect.x, rect.y); await page.mouse.down(); await page.mouse.up();
  };
  const typeText = (t) => page.connection.send("Input.insertText", { text: t });

  // 登录
  await page.goto(`${WEB}/ai-tool/home`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(2000);
  await clickEl('[aria-label="登录"]');
  await page.waitForTimeout(800);
  await clickEl('[role="dialog"] input[type="email"]');
  await typeText(email);
  await clickEl('[role="dialog"] input[type="password"]');
  await typeText(password);
  await page.evaluate(() => {
    [...document.querySelectorAll('[role="dialog"] button')].find((b) => /登录$/.test(b.textContent.trim()))?.click();
  });
  await page.waitForTimeout(3500);

  // 首页：能力卡只剩 2 张 + 无黏土渲染/智能编辑
  const cards = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter((b) => /^AI (视频|图片)$/.test(b.textContent.trim().split("\n")[0] ?? "") || b.textContent.includes("黏土渲染") || b.textContent.includes("智能编辑"));
    return { aiCards: document.body.innerText.match(/AI 视频|AI 图片|黏土渲染|智能编辑/g) ?? [] };
  });
  if (cards.aiCards.filter((t) => t === "AI 视频").length !== 1 || cards.aiCards.filter((t) => t === "AI 图片").length !== 1) throw new Error("能力卡缺失: " + JSON.stringify(cards.aiCards));
  if (cards.aiCards.includes("黏土渲染") || cards.aiCards.includes("智能编辑")) throw new Error("后两张卡未隐藏: " + JSON.stringify(cards.aiCards));
  await page.screenshot({ path: path.join(OUT, "d11-home-cards.png") });

  // 点击 AI 视频 → 生成页 composer 预选 视频生成
  await clickText("AI 视频");
  await page.waitForTimeout(3500);
  const composerType = await page.evaluate(() => document.querySelector('[data-testid="creation-composer"]')?.innerText ?? "");
  if (!composerType.includes("视频生成")) throw new Error("AI 视频卡未联动 composer 类型: " + composerType.slice(0, 80).replace(/\n/g, "|"));
  console.log("AI 视频 → composer 联动 OK");

  // 打开比例弹层截图
  await clickText("16:9");
  await page.waitForTimeout(800);
  const spec = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find((n) => n.textContent?.trim().startsWith("选择比例") && n.getBoundingClientRect().width > 100);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  console.log("比例弹层尺寸:", JSON.stringify(spec), "(原版 ≈330×286)");
  await page.screenshot({ path: path.join(OUT, "d11-spec-popover.png") });

  console.log("PAGE ERRORS:", errors.length);
} finally {
  await browser.close();
}
if (errors.length) process.exit(1);
console.log("D11 VERIFY PASS");
