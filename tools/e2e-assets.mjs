// 资产库 UI e2e（D8）：种真实资产 → 真实浏览器走 列表分组/三个下拉/详情弹层/批量操作。
// 断言 0 page error，截图入 docs/verify/。
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
const SB_URL = envGet("SUPABASE_URL");
const SERVICE_KEY = envGet("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = envGet("SUPABASE_ANON_KEY");

const email = `ui-asset-${Date.now()}@dreamina.local`;
const password = "ui-password-123";

// 1. 建用户
const createRes = await fetch(`${SB_URL}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({ email, password, email_confirm: true }),
});
if (!createRes.ok) throw new Error(`create user failed: ${await createRes.text()}`);
console.log("user:", email);

// 2. 登录拿 token
const signIn = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON_KEY, "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
}).then((r) => r.json());
const token = signIn.access_token;
if (!token) throw new Error("no token: " + JSON.stringify(signIn).slice(0, 200));
const authHeaders = { apikey: ANON_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" };

// 2.5 触发懒建 profiles 行（/api/me ensureProfile），否则 assets FK 失败
const me = await fetch("http://localhost:3101/api/me", { headers: { authorization: `Bearer ${token}` } });
console.log("me:", me.status);

// 3. 种真实资产：presign → 直传仓库内真实图片 → register（带尺寸/提示词/ taskId 分组）
const seedImages = [
  { file: "apps/web/public/seed/feed/7574008049594109202.jpg", w: 1024, h: 1024, prompt: "高端无线头戴式耳机产品广告海报，纯黑色背景，科技感氛围", taskId: null, daysAgo: 0 },
  { file: "apps/web/public/seed/feed/7374003065331913232.jpg", w: 1024, h: 1024, prompt: "产品场景图：极简工作台上的音箱，暖光", taskId: "task-seed-1", daysAgo: 0 },
  { file: "apps/web/public/seed/feed/7081168994673103362.jpg", w: 1024, h: 1024, prompt: "珠宝人像特写，深色背景，柔光", taskId: "task-seed-1", daysAgo: 0 },
  { file: "apps/web/public/seed/feed/7373942240399331857.jpg", w: 1920, h: 1080, prompt: "一只橘猫在纸箱旁，16:9 横构图", taskId: null, daysAgo: 1 },
  { file: "apps/web/public/seed/feed/7574137826606894344.jpg", w: 2560, h: 1440, prompt: "城市夜景延时摄影风格，2K 超清", taskId: null, daysAgo: 3 },
];
const seededIds = [];
for (const s of seedImages) {
  const bytes = fs.readFileSync(path.join(ROOT, s.file));
  const isPng = s.file.endsWith(".png");
  const contentType = isPng ? "image/png" : "image/jpeg";
  const presign = await fetch("http://localhost:3101/api/assets/presign", {
    method: "POST",
    headers: { ...authHeaders },
    body: JSON.stringify({ filename: path.basename(s.file), contentType, kind: "image" }),
  }).then((r) => r.json());
  const put = await fetch(presign.url, { method: "PUT", body: bytes, headers: { "content-type": contentType } });
  if (!put.ok) throw new Error(`put failed ${put.status}`);
  const reg = await fetch("http://localhost:3101/api/assets", {
    method: "POST",
    headers: { ...authHeaders },
    body: JSON.stringify({
      key: presign.key, kind: "image", mime: contentType, width: s.w, height: s.h,
      meta: { prompt: s.prompt, ...(s.taskId ? { taskId: s.taskId } : {}) },
    }),
  }).then((r) => r.json());
  if (!reg.id) throw new Error("register failed: " + JSON.stringify(reg).slice(0, 200));
  seededIds.push(reg.id);
  console.log("seeded", path.basename(s.file), reg.id);
}

// 4. 回拨 created_at（按 seedImages.daysAgo），制造 今天/昨天/N天前 分组
for (const [i, s] of seedImages.entries()) {
  if (!s.daysAgo) continue;
  const patchRes = await fetch(`${SB_URL}/rest/v1/assets?id=eq.${seededIds[i]}`, {
    method: "PATCH",
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ created_at: new Date(Date.now() - s.daysAgo * 86_400_000).toISOString() }),
  });
  if (!patchRes.ok) throw new Error(`backdate failed: ${patchRes.status}`);
}
console.log("backdate ok");

// ---------- UI ----------
const browser = await systemChromium.launch({ executablePath: exe });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120)));
  const shot = (name) => page.screenshot({ path: path.join(OUT, `assets-${name}.png`) });

  const clickEl = async (selector) => {
    const rect = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, selector);
    if (!rect) throw new Error(`not found: ${selector}`);
    await page.mouse.move(rect.x, rect.y);
    await page.mouse.down();
    await page.mouse.up();
  };
  const clickText = async (text) => {
    for (let i = 0; i < 10; i++) {
      const rect = await page.evaluate((t) => {
        // 匹配「直接文本节点」= t 的元素（兼容 icon+文字 混排按钮）
        const el = [...document.querySelectorAll("button, span, div, p")]
          .find((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim() === t)
            && n.getBoundingClientRect().width > 0);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, text);
      if (rect) {
        await page.mouse.move(rect.x, rect.y);
        await page.mouse.down();
        await page.mouse.up();
        return;
      }
      await page.waitForTimeout(400);
    }
    throw new Error(`text not found: ${text}`);
  };
  const typeText = (t) => page.connection.send("Input.insertText", { text: t });
  const clickAt = async (x, y) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
  };
  const pressEscape = async () => {
    await page.connection.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await page.connection.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  };

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

  // 资产库列表
  await page.goto(`${WEB}/ai-tool/assets`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(3000);
  const listText = await page.evaluate(() => document.body.innerText);
  if (!listText.includes("今天") || !listText.includes("昨天")) throw new Error("日期分组缺失: " + listText.slice(0, 150).replace(/\n/g, "|"));
  await shot("01-list");

  // 筛选下拉
  await clickText("筛选");
  await page.waitForTimeout(600);
  const filterText = await page.evaluate(() => document.body.innerText);
  for (const need of ["操作", "收藏", "类型", "超清", "分辨率", "1K", "2K", "4K", "8K", "比例", "21:9", "9:16"]) {
    if (!filterText.includes(need)) throw new Error(`筛选面板缺「${need}」`);
  }
  await shot("02-filter-open");
  await clickText("收藏"); // fav=1 → 空态
  await page.waitForTimeout(1200);
  const favEmpty = await page.evaluate(() => document.body.innerText);
  if (!favEmpty.includes("暂无相关资产")) throw new Error("收藏筛选未生效（应空态）");
  await shot("03-filter-fav-empty");
  await clickText("收藏"); // 取消
  await page.waitForTimeout(900);
  // 关闭筛选面板
  await pressEscape();
  await page.waitForTimeout(400);
  await clickAt(960, 700);
  await page.waitForTimeout(500);

  // 时间下拉
  await clickText("时间");
  await page.waitForTimeout(600);
  const timeProbe = await page.evaluate(() => ({
    dates: document.querySelectorAll('input[type="date"]').length,
    text: document.body.innerText,
  }));
  if (timeProbe.dates < 2) throw new Error("时间面板缺开始/结束日期输入");
  for (const need of ["全部", "最近一周", "最近一个月", "最近三个月"]) {
    if (!timeProbe.text.includes(need)) throw new Error(`时间面板缺「${need}」`);
  }
  await shot("04-time-open");
  await clickText("最近一周");
  await page.waitForTimeout(1200);
  await clickText("时间"); // 重开面板
  await page.waitForTimeout(400);
  await clickText("全部");
  await page.waitForTimeout(900);
  await clickAt(960, 700);
  await page.waitForTimeout(400);

  // 排序下拉
  await clickText("排序");
  await page.waitForTimeout(600);
  const sortText = await page.evaluate(() => document.body.innerText);
  for (const need of ["顺序", "近→远", "远→近"]) {
    if (!sortText.includes(need)) throw new Error(`排序面板缺「${need}」`);
  }
  await shot("05-sort-open");
  await clickText("远→近");
  await page.waitForTimeout(1200);
  // 升序后最早一组在前：第一组标题不应是 今天/昨天（种了 3 天前的资产）
  const ascFirst = await page.evaluate(() => document.querySelector("main h2")?.textContent);
  if (!ascFirst || ascFirst === "今天" || ascFirst === "昨天") throw new Error("远→近排序未生效, first group: " + ascFirst);
  await shot("06-sort-asc");
  await clickText("排序：远→近");
  await page.waitForTimeout(400);
  await clickText("近→远");
  await page.waitForTimeout(900);
  const descFirst = await page.evaluate(() => document.querySelector("main h2")?.textContent);
  if (descFirst !== "今天") throw new Error("近→远排序未生效, first group: " + descFirst);
  await clickAt(960, 700);
  await page.waitForTimeout(400);

  // 详情弹层（点第一张卡）
  await clickEl("main figure");
  await page.waitForTimeout(1500);
  const detailText = await page.evaluate(() => document.body.innerText);
  if (!detailText.includes("图片提示词")) throw new Error("详情缺提示词区");
  if (!detailText.includes("生成视频") || !detailText.includes("去画布编辑") || !detailText.includes("对口型") || !detailText.includes("在生成页定位")) {
    throw new Error("详情操作区不完整");
  }
  await shot("07-detail");

  // 详情内收藏（星标）→ 关闭
  await clickEl('[aria-label="收藏"]');
  await page.waitForTimeout(900);
  await pressEscape();
  await page.waitForTimeout(800);
  await shot("08-after-favorite");

  // 批量操作
  await clickText("批量操作");
  await page.waitForTimeout(600);
  const barText = await page.evaluate(() => document.body.innerText);
  if (!barText.includes("已选择 0 项内容")) throw new Error("批量栏文案缺失");
  if (!barText.includes("取消选择")) throw new Error("批量栏缺取消选择");
  // 勾两张卡
  await clickEl("main figure");
  await page.waitForTimeout(300);
  await clickEl("main figure:nth-child(2)");
  await page.waitForTimeout(500);
  const selText = await page.evaluate(() => document.body.innerText);
  if (!selText.includes("已选择 2 项内容")) throw new Error("勾选计数未更新: " + (selText.match(/已选择.{0,6}项内容/) ?? [""])[0]);
  await shot("09-batch-selected");
  // 批量收藏 → toast
  await clickText("收藏");
  await page.waitForTimeout(1200);
  await shot("10-batch-favorited");

  // 退出批量模式 → 详情「重新编辑」→ generate 页 composer 回填（pending-prefill 通道）
  await clickText("取消选择");
  await page.waitForTimeout(600);
  await clickEl("main figure");
  await page.waitForTimeout(1200);
  await clickText("重新编辑");
  await page.waitForTimeout(3000);
  const prefillText = await page.evaluate(
    () => document.querySelector('[data-testid="creation-composer"] textarea')?.value ?? "",
  );
  if (!prefillText.trim()) throw new Error("重新编辑未回填提示词");
  await shot("11-reedit-prefill");

  console.log("\nPAGE ERRORS:", errors.length);
  if (errors.length) errors.forEach((e) => console.log("  -", e));
  console.log("ASSETS UI E2E PASS");
} finally {
  await browser.close();
}
if (errors.length) process.exit(1);
