// Generate supabase/migrations/0006_cn_models.sql from RECON/jimeng-cn SSR configs.
// 模型清单/参数矩阵来自即梦真实配置（单一事实源：RECON/jimeng-cn/*.json）。
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const A = (p) => path.join(ROOT, p);
const CN = path.join(ROOT, "dreamina-clone/RECON/jimeng-cn");

const esc = (v) => String(v ?? "").replaceAll("'", "''");
const J = (o) => `'${esc(JSON.stringify(o))}'::jsonb`;

const load = (f) => JSON.parse(fs.readFileSync(path.join(CN, f), "utf8"));
const img = load("image_generate_model_config.json").data;
const vid = load("video_generate_model_config.json").data;
const imi = load("imitator_generate_model_config.json").data;

// ---- 定价（成本侧参考 OpenMontage 内置官方价；用户价 = 成本×加价系数，admin 可改）----
// image: price_cents = 每张基准(1.5k)；视频: price_cents = 每秒(720p)
const IMG_PRICE = { "图片 5.0 Pro": 8, "图片 5.0 Lite": 5, "图片 4.7": 6, "图片 4.6": 4, "图片 4.5": 4, "图片 4.1": 4, "图片 4.0": 4, "图片 3.1": 3, "图片 3.0": 3 };
const IMG_FACTOR = { "1.5k": 1.0, "2k": 1.8, "4k": 3.2 };
const VID_PRICE_SEC = {
  "即梦 Seedance 2.5": 24, "即梦 Seedance 2.0 mini": 9, "即梦 Seedance 2.0 Fast VIP": 14,
  "即梦 Seedance 2.0 VIP": 18, "即梦 Seedance 2.0 Fast": 12, "即梦 Seedance 2.0": 16,
  "即梦 Seedance 1.5 Pro": 20, "即梦 Seedance 1.0": 16, "即梦 Seedance 1.0 Fast": 11,
  "MiniMax H3": 14, "HappyHorse 1.1": 14,
};
const VID_FACTOR = { "480p": 0.6, "720p": 1.0, "1080p": 2.4, "4k": 4.0 };

function extractEnums(m) {
  const out = {};
  for (const o of m.options ?? []) {
    if (o.forbidden_display) continue;
    if (o.value_type === "enum") {
      const ev = o.enum_val ?? {};
      out[o.key] = { options: ev.string_value ?? ev.int_value ?? [], default: (ev.string_value ?? ev.int_value ?? [])[(ev.default_val_idx ?? 0)] ?? null };
    }
  }
  return out;
}

function extractImageParams(m) {
  const rm = m.resolution_map ?? {};
  const ratios = {};
  for (const [res, cfg] of Object.entries(rm)) {
    ratios[res] = {
      name: cfg.resolution_name,
      sizes: (cfg.image_ratio_sizes ?? []).map((s) => ({ ratio_type: s.ratio_type, width: s.width, height: s.height })),
      range: cfg.image_range_config ?? null,
    };
  }
  return {
    kind: "image",
    resolutions: Object.fromEntries(Object.entries(IMG_FACTOR).map(([k, f]) => [k, { factor: f, map: ratios[k] ?? null }])),
    generate_count_options: m.generate_count_options ?? [1, 2, 3, 4],
    default_generate_count: m.default_generate_count ?? 2,
  };
}

function extractVideoParams(m) {
  const enums = extractEnums(m);
  return {
    kind: "video",
    aspect_ratio: enums.video_aspect_ratio ?? { options: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], default: "16:9" },
    resolution: enums.resolution ?? { options: ["720p"], default: "720p" },
    resolution_factors: VID_FACTOR,
    duration_ms: vid.video_duration_display_range ?? { min_duration_ms: 4000, max_duration_ms: 15000 },
    input_media_type: enums.input_media_type ?? null,
    frames: enums.frames ?? null,
  };
}

const rows = [];
let i = 0;
for (const m of img.model_list ?? []) {
  const name = m.model_name;
  rows.push([
    `'image'`, `'${esc(m.model_req_key)}'`, `'${esc(name)}'`, `'${esc(m.model_tip ?? "")}'`,
    m.is_new_model ? `'New'` : `null`, `'per_image'`, String(IMG_PRICE[name] ?? 5), String(Math.round((IMG_PRICE[name] ?? 5) * 0.6)),
    J(IMG_FACTOR), J(extractImageParams(m)), String(i), img.default_model_index === i ? "true" : "false",
  ]);
  i++;
}
for (const m of vid.model_list ?? []) {
  const name = m.model_name.trim();
  const price = VID_PRICE_SEC[name] ?? 12;
  rows.push([
    `'video'`, `'${esc(m.model_req_key)}'`, `'${esc(name)}'`, `'${esc(m.model_tip ?? "")}'`,
    (m.icon_tag === "new" || m.model_name.includes("2.5") || m.model_name.includes("2.0")) ? `'New'` : `null`,
    `'per_second'`, String(price), String(Math.round(price * 0.6)),
    J(VID_FACTOR), J(extractVideoParams(m)), String(i), vid.default_model_idx === i ? "true" : "false",
  ]);
  i++;
}
// imitator
for (const [j, m] of (imi.model_list ?? []).entries()) {
  rows.push([
    `'motion_mimic'`, `'${esc("imitator_" + (m.feature_key || j))}'`, `'${esc(m.model_name)}'`, `'${esc(m.model_tip ?? "")}'`,
    m.icon_tag === "new" ? `'New'` : `null`, `'per_request'`, `6`, `4`, J({}), J({ kind: "motion_mimic", styles: (m.options ?? []).map((o) => o.name ?? o) }), String(i), j === (imi.default_model_idx ?? 0) ? "true" : "false",
  ]);
  i++;
}
// music / dubbing（实测：SeedMusic 1.0 Preview；tts_model_v3）
rows.push([`'music'`, `'seed_music_1_0_preview'`, `'SeedMusic 1.0 Preview'`, `'智能时长音乐生成'`, `null`, `'per_request'`, `8`, `5`, J({}), J({ kind: "music", duration: "smart" }), String(i), "true"]); i++;
rows.push([`'dubbing'`, `'tts_model_v3'`, `'即梦配音 v3'`, `'文本转语音，支持克隆声音'`, `null`, `'per_request'`, `2`, `1`, J({}), J({ kind: "dubbing", voice_clone: true }), String(i), "true"]); i++;
// llm（agent 用，双通道占位，默认关）
rows.push([`'llm'`, `'glm-4-flash'`, `'GLM-4 Flash'`, `'审核与 Agent 推理（智谱通道）'`, `null`, `'per_token'`, `0`, `0`, J({}), J({ kind: "llm", io_pricing: { in_cents_per_m: 0, out_cents_per_m: 0 } }), String(i), "true"]); i++;

const modeRows = [
  `('agent','Agent 模式','agent',true,1)`,
  `('image','图片生成','image',true,2)`,
  `('video','视频生成','video',true,3)`,
  `('music','音乐生成','music',true,4)`,
  `('dubbing','配音生成','dubbing',true,5)`,
  `('digital_human','数字人','digital_human',true,6)`,
  `('motion_mimic','动作模仿','motion_mimic',true,7)`,
];

const sql = `-- CN 创作模式配置：模型/面板选项（数据源 RECON/jimeng-cn SSR 配置，2026-08-30 抓取）
-- 幂等：ON CONFLICT DO UPDATE
insert into public.creation_modes (key, label, icon, enabled, sort) values
${modeRows.join(",\n")}
on conflict (key) do update set label = excluded.label, icon = excluded.icon, enabled = excluded.enabled, sort = excluded.sort;

insert into public.models (provider, creation_type, code, display_name, description, badge, unit_type, price_cents, provider_cost_cents, resolution_factor, params, sort, is_default, enabled)
values
${rows.map((r) => `(${["'ark'", r, "true"].join(", ")})`).join(",\n")}
on conflict (provider, code) do update set
  display_name = excluded.display_name, description = excluded.description, badge = excluded.badge,
  unit_type = excluded.unit_type, price_cents = excluded.price_cents, provider_cost_cents = excluded.provider_cost_cents,
  params = excluded.params, sort = excluded.sort, is_default = excluded.is_default, enabled = excluded.enabled;
`;
fs.writeFileSync(A("supabase/migrations/0006_cn_models_data.sql"), sql);
console.log("models rows:", rows.length, "→ 0006_cn_models_data.sql", sql.length, "bytes");
