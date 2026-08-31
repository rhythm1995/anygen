// 视频面板视觉验证：登录 → generate → 切视频 → 抓各状态截图，对照 RECON/auth/generate-video/。
import { systemChromium } from "/Users/bugzhang/.zcode/skills/web-clone/scripts/lib/system-browser.mjs";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const WEB = process.env.WEB_URL ?? "http://localhost:3100";
const exe = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = path.join(ROOT, "docs", "verify", "video-panel");
fs.mkdirSync(OUT, { recursive: true });

const envText = fs.readFileSync(path.join(ROOT, "apps/api/.env.local"), "utf8");
const envGet = (k) => envText.match(new RegExp(`^${k}="?(.*?)"?$`, "m"))?.[1];
const email = `uiv-${Date.now()}@dreamina.local`;
const password = "ui-password-123";
const key = envGet("SUPABASE_SERVICE_ROLE_KEY");
const sbUrl = envGet("SUPABASE_URL");
await fetch(`${sbUrl}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({ email, password, email_confirm: true }),
});
console.log("user:", email);

const browser = await systemChromium.launch({ executablePath: exe });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120)));
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const clickEl = async (selector) => {
    const rect = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, selector);
    if (!rect) throw new Error(`not found: ${selector}`);
    await page.mouse.move(rect.x, rect.y); await page.mouse.down(); await page.mouse.up();
  };
  const clickText = async (text) => {
    const rect = await page.evaluate((t) => {
      const els = [...document.querySelectorAll("button, [role='menuitem'], [role='option']")].filter((e) => e.textContent.trim().includes(t) && e.getBoundingClientRect().height > 0);
      const el = els[els.length - 1];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, text);
    if (!rect) throw new Error(`text not found: ${text}`);
    await page.mouse.move(rect.x, rect.y); await page.mouse.down(); await page.mouse.up();
  };
  const typeText = (t) => page.connection.send("Input.insertText", { text: t });

  // 登录
  await page.goto(`${WEB}/ai-tool/home`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(2500);
  await clickEl('[aria-label="登录"]');
  await page.waitForTimeout(800);
  await clickEl('[role="dialog"] input[type="email"]');
  await typeText(email);
  await clickEl('[role="dialog"] input[type="password"]');
  await typeText(password);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('[role="dialog"] button')];
    btns.find((b) => /登录$|sign in$/i.test(b.textContent.trim()))?.click();
  });
  await page.waitForTimeout(4000);

  // generate 页 → 切视频生成
  await page.goto(`${WEB}/ai-tool/generate`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(3000);
  await shot("00-landing");
  await clickText("Agent 模式");
  await page.waitForTimeout(700);
  await shot("01-type-menu");
  await clickText("视频生成");
  await page.waitForTimeout(1500);
  await shot("02-video-panel");

  // 参考模式菜单
  await clickText("全能参考");
  await page.waitForTimeout(700);
  await shot("10-refmenu");
  await page.connection.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await page.connection.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.waitForTimeout(400);

  // 模式逐个切换
  for (const [i, m] of [["11", "首尾帧"], ["12", "智能多帧"], ["13", "智能编辑"], ["14", "超长视频"]].entries()) {
    await clickEl('[aria-label="参考模式"]');
    await page.waitForTimeout(600);
    await clickText(m[1]);
    await page.waitForTimeout(1200);
    await shot(`${m[0]}-mode-${m[1]}`);
  }

  // 模型菜单
  await clickEl('[aria-label="选择模型"]');
  await page.waitForTimeout(700);
  await shot("20-model-menu");
  await page.connection.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await page.connection.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.waitForTimeout(400);

  // 比例弹层
  await clickEl('[aria-label="比例与分辨率"]');
  await page.waitForTimeout(700);
  await shot("30-spec-popover");
  await page.connection.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await page.connection.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.waitForTimeout(400);

  // 时长滑条弹层（普通 + 超长）
  await clickEl('[aria-label="参考模式"]');
  await page.waitForTimeout(600);
  await clickText("全能参考");
  await page.waitForTimeout(1500);
  await clickEl('[aria-label="时长"]');
  await page.waitForTimeout(700);
  await shot("50-duration-popover");
  await clickEl('[aria-label="时长"]');
  await page.waitForTimeout(500);
  await clickEl('[aria-label="参考模式"]');
  await page.waitForTimeout(600);
  await clickText("超长视频");
  await page.waitForTimeout(1500);
  await clickEl('[aria-label="时长"]');
  await page.waitForTimeout(700);
  await shot("51-duration-long");

  // 输入文字
  await clickEl('[data-testid="creation-composer"] textarea');
  await typeText("一只橘猫在窗台上看雨");
  await page.waitForTimeout(500);
  await shot("40-typed");

  console.log("page errors:", errors.length, errors.slice(0, 3));
  console.log("DONE →", OUT);
} finally {
  await browser.close();
}
