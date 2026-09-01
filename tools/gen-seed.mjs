// Generate supabase/seed.sql from captured fixtures + copy local seed images to apps/web/public/seed.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const A = (p) => path.join(ROOT, p);
const DC = path.join(ROOT, ".dreamina-clone");

// 1. collect url -> localPath from both manifests
const maps = ["RECON/asset-manifest.json", "RECON/auth-manifest.json"];
const urlMap = new Map();
for (const m of maps) {
  const p = path.join(DC, m);
  if (!fs.existsSync(p)) continue;
  for (const a of JSON.parse(fs.readFileSync(p, "utf8")).assets) {
    if (a.status === "ok") urlMap.set(a.url, a.localPath);
  }
}
const stripQuery = (u) => u.split("?")[0];
const urlMapNoQuery = new Map([...urlMap.keys()].map((k) => [stripQuery(k), urlMap.get(k)]));
const contentHash = (u) => /\/([0-9a-f]{32})(?:~|-)/.exec(u ?? "")?.[1] ?? null;
const hashIndex = new Map(); // contentHash -> localPath（任一命中即可）
for (const [u, local] of urlMap) {
  const h = contentHash(u);
  if (h && !hashIndex.has(h)) hashIndex.set(h, local);
}
const findLocal = (url) => {
  if (!url) return null;
  const byExact = urlMap.get(url) ?? urlMapNoQuery.get(stripQuery(url));
  if (byExact) return byExact;
  const h = contentHash(url);
  return h ? hashIndex.get(h) ?? null : null;
};

// 2. parse feed fixtures
const feedDir = path.join(DC, "RECON/network/fixtures");
const items = [];
for (const f of fs.readdirSync(feedDir)) {
  if (!f.startsWith("mweb-v1-feed-")) continue;
  const json = JSON.parse(fs.readFileSync(path.join(feedDir, f), "utf8"));
  for (const it of json?.data?.item_list ?? []) {
    if (items.find((x) => x.id === it?.common_attr?.id)) continue;
    items.push(it);
  }
}
console.log("feed items:", items.length);

// 3. agent config
const agentCfg = JSON.parse(fs.readFileSync(path.join(DC, "RECON/auth/generate-api/mweb-v1-creation_agent-v2-get_agent_config.json"), "utf8"))?.data ?? {};
const imageModels = agentCfg?.image_data?.model_list ?? [];
const videoModels = agentCfg?.video_data?.model_list ?? [];
const skills = agentCfg?.skill_data ?? [];
console.log("models:", imageModels.length, "img /", videoModels.length, "video; skills:", skills.length);

// 4. images → apps/web/public/seed
const seedDir = A("apps/web/public/seed/feed");
fs.mkdirSync(seedDir, { recursive: true });
// fallback pool: same-aspect local jpeg from harvest（用 sips 读尺寸，macOS 自带）
import { execFileSync } from "node:child_process";
const dimCache = new Map();
const imageSize = (localPath) => {
  if (dimCache.has(localPath)) return dimCache.get(localPath);
  try {
    const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path.join(DC, "assets", localPath)], { encoding: "utf8" });
    const w = Number(/pixelWidth: (\d+)/.exec(out)?.[1] ?? 1);
    const h = Number(/pixelHeight: (\d+)/.exec(out)?.[1] ?? 1);
    const v = { w, h };
    dimCache.set(localPath, v);
    return v;
  } catch { return { w: 1, h: 1 }; }
};
const pool = [...new Set(urlMap.values())].filter((p) => /\.(jpe?g|png|webp)$/i.test(p) && p.includes("ibyteimg"));
const pickByAspect = (targetRatio, used) => {
  let best = null, bestDiff = Infinity;
  const tryPick = () => {
    for (const p of pool) {
      if (used.has(p)) continue;
      const { w, h } = imageSize(p);
      const diff = Number.isFinite(w / h - targetRatio) ? Math.abs(w / h - targetRatio) : Infinity;
      if (diff < bestDiff) { bestDiff = diff; best = p; }
    }
  };
  tryPick();
  if (!best) { used.clear(); tryPick(); }  // 池用尽则重置（feed 内容允许重复）
  if (best) used.add(best);
  return best;
};
const usedPool = new Set();

const copySeed = (srcLocal, destName) => {
  const src = path.join(DC, "assets", srcLocal);
  const dest = path.join(seedDir, destName);
  fs.copyFileSync(src, dest);
  return `/seed/feed/${destName}`;
};

const esc = (v) => String(v ?? "").replaceAll("'", "''");

const rows = [];
let fallbacks = 0;
for (const it of items) {
  const c = it.common_attr ?? {};
  const id = String(c.id ?? "").slice(0, 40);
  if (!id) continue;
  const candidates = [c.cover_url, it?.image?.large_images?.[0]?.image_url, it?.image?.image_url, it?.video?.cover_url];
  let local = null;
  for (const u of candidates) {
    local = findLocal(u);
    if (local) break;
  }
  let url;
  if (local) {
    url = copySeed(local, `${id}.jpg`);
  } else {
    const w = c.cover_width || it?.image?.large_images?.[0]?.width || 640;
    const h = c.cover_height || it?.image?.large_images?.[0]?.height || 640;
    const standIn = pickByAspect(w / h, usedPool);
    fallbacks++;
    if (standIn) {
      url = copySeed(standIn, `${id}.jpg`);
    } else { url = null; }
  }
  if (!url) continue;
  rows.push([
    `'${esc(id)}'`,
    `'${esc(c.title ?? "")}'`,
    `'${url}'`,
    String(c.cover_width ?? it?.image?.large_images?.[0]?.width ?? 640),
    String(c.cover_height ?? it?.image?.large_images?.[0]?.height ?? 640),
    `'${esc(it?.author?.name ?? "")}'`,
    `'${esc(it?.author?.avatar_url ?? "")}'`,
    `'${esc(it?.aigc_image_params?.text2image_params?.model_config?.model_req_key ?? it?.aigc_image_params?.text2video_params?.model_config?.model_req_key ?? "")}'`,
    `'${it?.aigc_image_params?.text2video_params ? "text2video" : it?.aigc_image_params?.image2image_params ? "image2image" : "text2image"}'`,
  ].join(", "));
}
console.log("seed rows:", rows.length, "| fallback covers:", fallbacks);

// 5. write seed.sql
const modelRows = [...imageModels.map((m, i) => {
  const key = m?.model_req_key ?? m?.key ?? `img-${i}`;
  return `('${esc(key)}', '${esc(m?.model_name ?? m?.name ?? key)}', 'image', ${i === (agentCfg?.image_data?.default_model_index ?? 0)})`;
}), ...videoModels.map((m, i) => {
  const key = m?.model_req_key ?? m?.key ?? `vid-${i}`;
  return `('${esc(key)}', '${esc(m?.model_name ?? m?.name ?? key)}', 'video', ${i === (agentCfg?.video_data?.default_model_idx ?? 0)})`;
})];

const skillRows = skills.map((s) => `('${esc(s.id)}', '${esc(s.name)}', '${esc(s.default_title ?? s.title ?? "")}', '${esc(s.default_desc ?? s.description ?? "")}', true)`);

const sql = `-- seed：来自原站捕获 fixtures（.dreamina-clone/RECON），封面已本地化 /seed/feed/*
truncate public.feed_items;
insert into public.feed_items (id, title, cover_url, width, height, author_name, author_avatar, model_req_key, generate_type) values
${rows.map((r) => `(${r})`).join(",\n")};

truncate public.agent_models;
insert into public.agent_models (key, name, kind, is_default) values
${modelRows.join(",\n")};

truncate public.agent_skills;
insert into public.agent_skills (id, name, title, description, enabled) values
${skillRows.join(",\n")};
`;
fs.writeFileSync(A("supabase/seed.sql"), sql);
console.log("seed.sql written:", sql.length, "bytes");
