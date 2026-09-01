#!/usr/bin/env node
/**
 * 提示词库数据导入（D12+）：复刻 vendor/infinite-canvas service/prompt_fetch.go（AGPL-3.0）
 * 的 7 个 GitHub 源解析器，一次性抓取并生成 apps/web/data/prompt-library.json。
 * 用法：node tools/fetch-prompts.mjs（需外网；单源失败跳过并如实报告）
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "apps/web/data/prompt-library.json");

const BASES = {
  gptImage2: "https://raw.githubusercontent.com/tigerowo/awesome-gpt-image-2-prompts/main",
  awesomeGptImage: "https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main",
  awesomeGpt4o: "https://raw.githubusercontent.com/ImgEdify/Awesome-GPT4o-Image-Prompts/main",
  youMindGptImage2: "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main",
  youMindNano: "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/main",
  xianyu: "https://raw.githubusercontent.com/xianyu110/awesome-gptimage2/main",
  davidwu: "https://raw.githubusercontent.com/davidwuw0811-boop/awesome-gpt-image2-prompts/main",
};

const CATEGORIES = [
  { category: "gpt-image-2-prompts", name: "GPT Image 2 Prompts", githubUrl: "https://github.com/tigerowo/awesome-gpt-image-2-prompts" },
  { category: "awesome-gpt-image", name: "Awesome GPT Image", githubUrl: "https://github.com/ZeroLu/awesome-gpt-image" },
  { category: "awesome-gpt4o-image-prompts", name: "Awesome GPT4o Image Prompts", githubUrl: "https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts" },
  { category: "xianyu-awesome-gptimage2", name: "Xianyu Awesome GPT Image 2", githubUrl: "https://github.com/xianyu110/awesome-gptimage2" },
  { category: "youmind-gpt-image-2", name: "YouMind GPT Image 2", githubUrl: "https://github.com/YouMind-OpenLab/awesome-gpt-image-2" },
  { category: "youmind-nano-banana-pro", name: "YouMind Nano Banana Pro", githubUrl: "https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts" },
  { category: "davidwu-gpt-image2-prompts", name: "awesome-gpt-image2-prompts", githubUrl: "https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts" },
];

const GPT_IMAGE2_CASE_FILES = ["README.md", "cases/ad-creative.md", "cases/character.md", "cases/comparison.md", "cases/ecommerce.md", "cases/portrait.md", "cases/poster.md", "cases/ui.md"];

async function fetchText(base, file) {
  const res = await fetch(`${base}/${file}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${file} 拉取失败 HTTP ${res.status}`);
  return res.text();
}

// ---------- 通用工具（对齐 Go 版） ----------
const firstMatch = (value, pattern, flags = "") => {
  const m = new RegExp(pattern, flags).exec(value);
  return m?.[1]?.trim() ?? "";
};
const firstMatchRaw = (value, pattern, flags = "") => new RegExp(pattern, flags).exec(value)?.[0] ?? "";

const splitBeforeHeading = (markdown, prefix) => {
  const blocks = [];
  let current = [];
  for (const line of markdown.split("\n")) {
    if (line.startsWith(prefix) && current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  blocks.push(current.join("\n"));
  return blocks;
};

const splitTags = (value, pattern) =>
  value
    .split(new RegExp(pattern))
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

const tagsFromCategory = (category) => splitTags(category.replace(/\s+Cases$/i, ""), "\\s*(&|and)\\s*");
const tagsFromHeading = (heading) => splitTags(heading.replace(/[^\p{L}\p{N}/&、与 ]/gu, ""), "\\s*(/|&|、|与)\\s*");

const absoluteImage = (base, image) => {
  if (!image || /^https?:\/\//.test(image)) return image ?? "";
  return `${base}/${image.replace(/^\./, "").replace(/^\//, "")}`;
};

const markdownPreview = (images) => images.filter(Boolean).map((image) => `![](${image})`).join("\n\n");

const extractMarkdownImages = (base, block) => {
  const seen = new Set();
  const images = [];
  for (const pattern of [/<img[^>]+src="([^"]+)"/, /!\[[^\]]*]\(([^)]+)\)/]) {
    for (const match of block.matchAll(new RegExp(pattern.source, "g"))) {
      const image = absoluteImage(base, match[1]);
      if (image && !seen.has(image)) {
        seen.add(image);
        images.push(image);
      }
    }
  }
  return images;
};

const leftPad = (value) => String(value).padStart(3, "0");

const normalizePromptTime = (value) => {
  value = (value ?? "").trim();
  if (!value) return "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
};

const firstNonEmpty = (...values) => values.find((value) => (value ?? "").trim() !== "")?.trim() ?? "";

// ---------- 源 1：tigerowo/awesome-gpt-image-2-prompts ----------
async function buildGptImage2() {
  const base = BASES.gptImage2;
  const raw = await fetchText(base, "data/ingested_tweets.json");
  const data = JSON.parse(raw);
  const records = Array.isArray(data) ? data : (data.records ?? []);
  const cases = new Map();
  const caseRe = /### Case \d+: \[[^\]]+\]\(([^)]+)\)[\s\S]*?\*\*Prompt:\*\*\s*\r?\n\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```/g;
  const imageDirRe = /images\/\w+_case\d+/;
  const imageRe = /<img[^>]+src="([^"]+)"|!\[[^\]]*\]\(([^)]+)\)/;
  for (const file of GPT_IMAGE2_CASE_FILES) {
    let markdown;
    try {
      markdown = await fetchText(base, file);
    } catch {
      continue;
    }
    for (const match of markdown.matchAll(caseRe)) {
      const prompt = match[2].trim();
      const imgMatch = imageRe.exec(match[0]);
      const image = imgMatch ? absoluteImage(base, imgMatch[1] || imgMatch[2]) : "";
      const item = { prompt, image };
      cases.set(match[1], item);
      const dir = imageDirRe.exec(match[0])?.[0];
      if (dir) cases.set(dir, item);
    }
  }
  const items = [];
  for (const record of records) {
    const tweetUrl = record.tweet_url ?? "";
    const imageDir = record.image_dir ?? "";
    let c = cases.get(tweetUrl);
    if (!c?.prompt) c = cases.get(imageDir);
    if (!c?.prompt) continue;
    const date = normalizePromptTime(record.added_at);
    items.push({
      id: `gpt-image-2-prompts-${leftPad(items.length + 1)}`,
      title: (record.title ?? "").trim(),
      coverUrl: c.image,
      prompt: c.prompt,
      tags: splitTags((record.category ?? "").replace(/\s+Cases$/i, ""), "\\s*(&|and)\\s*"),
      createdAt: date,
      updatedAt: date,
      preview: markdownPreview([c.image]),
    });
  }
  return items;
}

// ---------- 源 2：ZeroLu/awesome-gpt-image ----------
async function buildAwesomeGptImage() {
  const base = BASES.awesomeGptImage;
  const markdown = await fetchText(base, "README.md");
  const items = [];
  for (const section of splitBeforeHeading(markdown, "## ")) {
    const tags = tagsFromHeading(firstMatch(section, "^##\\s+(.+)$", "m"));
    for (const block of splitBeforeHeading(section, "### ")) {
      const title = firstMatch(block, "^###\\s+(.+)$", "m").replace(/\[([^\]]+)]\([^)]+\)/g, "$1").trim();
      const prompt = firstMatch(block, "\\*\\*Prompt:\\*\\*\\s*\\r?\\n\\s*```[\\w-]*\\r?\\n([\\s\\S]*?)\\r?\\n```");
      if (!title || !prompt) continue;
      const images = extractMarkdownImages(base, block);
      items.push({ id: `awesome-gpt-image-${leftPad(items.length + 1)}`, title, coverUrl: images[0] ?? "", prompt, tags, preview: markdownPreview(images) });
    }
  }
  return items;
}

// ---------- 源 3：ImgEdify/Awesome-GPT4o-Image-Prompts ----------
async function buildAwesomeGpt4o() {
  const base = BASES.awesomeGpt4o;
  const markdown = await fetchText(base, "README.zh-CN.md");
  const items = [];
  for (const block of splitBeforeHeading(markdown, "### ")) {
    const title = firstMatch(block, "^###\\s+(.+)$", "m");
    const prompt = firstMatch(block, "- \\*\\*提示词文本：\\*\\*\\s*`([\\s\\S]*?)`");
    if (!title || !prompt) continue;
    const images = extractMarkdownImages(base, block);
    items.push({ id: `awesome-gpt4o-image-prompts-${leftPad(items.length + 1)}`, title, coverUrl: images[0] ?? "", prompt, tags: ["gpt4o"], preview: markdownPreview(images) });
  }
  return items;
}

// ---------- 源 4/5：YouMind 两仓 ----------
async function buildYouMind(base, idPrefix, modelTag) {
  const markdown = await fetchText(base, "README_zh.md");
  const items = [];
  for (const block of splitBeforeHeading(markdown, "### ")) {
    const title = firstMatch(block, "^###\\s+No\\.\\s*\\d+:\\s*(.+)$", "m");
    const prompt = firstMatch(block, "#### [\\s\\S]*?提示词\\s*\\r?\\n\\s*```[\\w-]*\\r?\\n([\\s\\S]*?)\\r?\\n```");
    if (!title || !prompt) continue;
    const images = extractMarkdownImages(base, block);
    const tags = [modelTag];
    const parts = title.split(" - ");
    if (parts.length > 1) tags.push(...tagsFromHeading(parts[0]));
    items.push({ id: `${idPrefix}-${leftPad(items.length + 1)}`, title, coverUrl: images[0] ?? "", prompt, tags, preview: markdownPreview(images) });
  }
  return items;
}

// ---------- 源 6：xianyu110/awesome-gptimage2 ----------
function markdownSection(markdown, startHeading, endHeading) {
  const start = markdown.indexOf(startHeading);
  if (start < 0) return "";
  const rest = markdown.slice(start + startHeading.length);
  const end = rest.indexOf(endHeading);
  if (end < 0) return markdown.slice(start);
  return markdown.slice(start, start + startHeading.length + end);
}

const cleanXianyuCategory = (value) => {
  value = value.trim();
  for (const sep of ["、", ".", "．", " "]) {
    const index = value.indexOf(sep);
    if (index >= 0) {
      const prefix = value.slice(0, index).trim();
      if (prefix !== "" && [...prefix].length <= 4) value = value.slice(index + sep.length).trim();
      break;
    }
  }
  return value;
};

const cleanXianyuPromptTitle = (value) => {
  value = value.trim();
  const index = value.indexOf(" ");
  if (index > 0) {
    const prefix = value.slice(0, index);
    if (prefix.includes(".") || prefix.includes("．")) value = value.slice(index + 1).trim();
  }
  return value;
};

const xianyuCodeBlockText = (block) => {
  const lines = [];
  let inCode = false;
  for (const line of block.split("\n")) {
    const text = line.trim();
    if (text.startsWith("```")) {
      if (inCode) break;
      inCode = true;
      continue;
    }
    if (inCode) lines.push(line);
  }
  return lines.join("\n").trim();
};

const xianyuFallbackPromptText = (block) => {
  const lines = [];
  for (const line of block.split("\n")) {
    let text = line.trim();
    if (!text || /^(#|---|!\[|\||>|```)/.test(text)) continue;
    if (/^- (原文链接|公众号|作者|本次补充|说明)/.test(text)) continue;
    text = text.replace(/^-/, "").trim().replace(/^\*/, "").trim();
    if (text.startsWith("提示词：")) text = text.replace(/^提示词：/, "").trim();
    if (text && !text.startsWith("http")) lines.push(text);
  }
  return lines.join("\n");
};

function parseXianyuPromptCollection(markdown) {
  const section = markdownSection(markdown, "## 提示词合集", "## 高级技巧");
  const items = [];
  let currentCategory = "";
  let currentTitle = "";
  let currentLines = [];
  const finish = () => {
    if (!currentTitle || currentCategory === "补充案例提示词") return;
    const block = currentLines.join("\n");
    let prompt = xianyuCodeBlockText(block);
    if (!prompt) prompt = xianyuFallbackPromptText(block);
    if (!prompt) return;
    const images = extractMarkdownImages(BASES.xianyu, block);
    const tags = ["gpt-image-2"];
    if (currentCategory) tags.push(...splitTags(currentCategory, "\\s*(/|&|、|与)\\s*"));
    items.push({ id: `xianyu-awesome-gptimage2-${leftPad(items.length + 1)}`, title: currentTitle, coverUrl: images[0] ?? "", prompt, tags, preview: markdownPreview(images) });
  };
  for (const line of section.split("\n")) {
    if (line.startsWith("### ") && !line.startsWith("#### ")) {
      finish();
      currentTitle = "";
      currentLines = [];
      currentCategory = cleanXianyuCategory(line.replace(/^### /, "").trim());
      continue;
    }
    if (line.startsWith("#### ")) {
      finish();
      currentTitle = cleanXianyuPromptTitle(line.replace(/^#### /, "").trim());
      currentLines = [];
      continue;
    }
    if (currentTitle) currentLines.push(line);
  }
  finish();
  return items;
}

async function buildXianyuLatest(offset) {
  const raw = await fetchText(BASES.xianyu, "data/latest-prompts.json");
  const data = JSON.parse(raw);
  const flat = [...(data.dates ?? []).flatMap((group) => group.items ?? []), ...(data.items ?? [])];
  const items = [];
  const seen = new Set();
  for (const item of flat) {
    const prompt = (item.prompt ?? "").trim();
    if (!prompt) continue;
    const key = firstNonEmpty(item.x_url, item.url, (item.author ?? "") + (item.created_at ?? "") + prompt);
    if (seen.has(key)) continue;
    seen.add(key);
    const image = firstNonEmpty(item.primary_image_url, ...(item.image_urls ?? []));
    const title = firstNonEmpty(item.reason, item.author, "X Prompt");
    const date = normalizePromptTime(item.created_at);
    const previewLines = [firstNonEmpty(item.x_url, item.url), ...(item.image_urls ?? []).map((url) => url.trim()).filter(Boolean)];
    if (previewLines.length === 1 && image) previewLines.push(image);
    items.push({ id: `xianyu-awesome-gptimage2-${leftPad(offset + items.length + 1)}`, title, coverUrl: image, prompt, tags: ["x"], createdAt: date, updatedAt: date, preview: previewLines.join("\n") });
  }
  return items;
}

async function buildXianyu() {
  const markdown = await fetchText(BASES.xianyu, "README.md");
  const items = parseXianyuPromptCollection(markdown);
  const latest = await buildXianyuLatest(items.length).catch(() => []);
  return [...items, ...latest];
}

// ---------- 源 7：davidwu ----------
async function buildDavidWu() {
  const raw = await fetchText(BASES.davidwu, "prompts.json");
  const data = JSON.parse(raw);
  const items = [];
  for (const item of Array.isArray(data) ? data : []) {
    const title = (item.title_cn ?? item.title_en ?? "").trim();
    const prompt = (item.prompt ?? "").trim();
    if (!title || !prompt) continue;
    const image = absoluteImage(BASES.davidwu, item.image);
    const tags = splitTags([item.category_cn, item.category, item.author, item.source].join("/"), "/");
    if (item.needs_ref) tags.push("需要参考图");
    const preview = [item.title_en, item.note, image ? `![](${image})` : ""].filter(Boolean).join("\n\n");
    items.push({ id: `davidwu-gpt-image2-prompts-${leftPad(item.id)}`, title, coverUrl: image, prompt, tags, preview });
  }
  return items;
}

// ---------- 主流程 ----------
const builders = [
  ["gpt-image-2-prompts", buildGptImage2],
  ["awesome-gpt-image", buildAwesomeGptImage],
  ["awesome-gpt4o-image-prompts", buildAwesomeGpt4o],
  ["xianyu-awesome-gptimage2", buildXianyu],
  ["youmind-gpt-image-2", () => buildYouMind(BASES.youMindGptImage2, "youmind-gpt-image-2", "gpt-image-2")],
  ["youmind-nano-banana-pro", () => buildYouMind(BASES.youMindNano, "youmind-nano-banana-pro", "nano-banana-pro")],
  ["davidwu-gpt-image2-prompts", buildDavidWu],
];

const prompts = [];
const categories = [];
const report = [];

for (const [category, builder] of builders) {
  try {
    const items = await builder();
    for (const item of items) {
      prompts.push({ ...item, category, githubUrl: CATEGORIES.find((entry) => entry.category === category)?.githubUrl });
    }
    categories.push({ ...CATEGORIES.find((entry) => entry.category === category), count: items.length });
    report.push(`✓ ${category}: ${items.length} 条`);
  } catch (error) {
    categories.push({ ...CATEGORIES.find((entry) => entry.category === category), count: 0 });
    report.push(`✕ ${category}: ${error.message.slice(0, 80)}`);
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), categories, prompts }, null, 1));
console.log(report.join("\n"));
console.log(`→ ${prompts.length} 条提示词写入 ${OUT.replace(ROOT + "/", "")}`);
if (!prompts.length) {
  console.error("没有任何源成功，拒绝写入空库——检查网络后重试");
  process.exit(1);
}
