-- OpenRouter 图像模型（用户 2026-08-31 指定接入清单）
-- 真实成本来自 OpenRouter usage.cost 探测；用户价 = 成本×约1.4 取整
insert into public.models (provider, creation_type, code, display_name, description, badge, unit_type, price_cents, provider_cost_cents, resolution_factor, params, sort, is_default, enabled) values
('openrouter', 'image', 'meta/muse-image', 'Muse Image', 'Meta 图像生成', null, 'per_image', 11, 8, '{"1.5k":1,"2k":1,"4k":1}', '{"kind":"image","route":"images","resolutions":{"2k":{"factor":1}},"generate_count_options":[1],"default_generate_count":1}', 20, false, true),
('openrouter', 'image', 'bytedance-seed/seedream-5-0-lite', 'Seedream 5.0 Lite (OR)', '字节 Seedream 5.0 Lite（OpenRouter 通道）', null, 'per_image', 11, 8, '{"1.5k":1,"2k":1,"4k":1}', '{"kind":"image","route":"images","resolutions":{"2k":{"factor":1}},"generate_count_options":[1],"default_generate_count":1}', 21, false, true),
('openrouter', 'image', 'bytedance-seed/seedream-5-0-pro', 'Seedream 5.0 Pro (OR)', '字节 Seedream 5.0 Pro（OpenRouter 通道）', 'Pro', 'per_image', 21, 15, '{"1.5k":1,"2k":1,"4k":1}', '{"kind":"image","route":"images","resolutions":{"2k":{"factor":1}},"generate_count_options":[1],"default_generate_count":1}', 22, false, true),
('openrouter', 'image', 'x-ai/grok-imagine-image-2.0', 'Grok Imagine 2.0', 'xAI Grok 图像生成', null, 'per_image', 3, 2, '{"1.5k":1,"2k":1,"4k":1}', '{"kind":"image","route":"chat","resolutions":{"2k":{"factor":1}},"generate_count_options":[1],"default_generate_count":1}', 23, false, true),
('openrouter', 'image', 'google/gemini-3.1-flash-lite-image', 'Gemini 3.1 Flash Lite', 'Google Gemini 快速版图像', null, 'per_image', 5, 3, '{"1.5k":1,"2k":1,"4k":1}', '{"kind":"image","route":"chat","resolutions":{"2k":{"factor":1}},"generate_count_options":[1],"default_generate_count":1}', 24, false, true),
('openrouter', 'image', 'openai/gpt-image-2', 'GPT Image 2', 'OpenAI GPT 图像生成', null, 'per_image', 14, 10, '{"1.5k":1,"2k":1,"4k":1}', '{"kind":"image","route":"images","resolutions":{"2k":{"factor":1}},"generate_count_options":[1],"default_generate_count":1}', 25, false, true),
('openrouter', 'image', 'google/gemini-3.1-flash-image', 'Gemini 3.1 Flash', 'Google Gemini 图像生成', null, 'per_image', 10, 7, '{"1.5k":1,"2k":1,"4k":1}', '{"kind":"image","route":"chat","resolutions":{"2k":{"factor":1}},"generate_count_options":[1],"default_generate_count":1}', 26, false, true),
('openrouter', 'image', 'google/gemini-3-pro-image', 'Gemini 3 Pro Image', 'Google Gemini Pro 图像（可出多图）', 'New', 'per_image', 19, 14, '{"1.5k":1,"2k":1,"4k":1}', '{"kind":"image","route":"chat","resolutions":{"2k":{"factor":1}},"generate_count_options":[1],"default_generate_count":1}', 27, false, true)
on conflict (provider, code) do update set
  display_name = excluded.display_name, description = excluded.description, badge = excluded.badge,
  price_cents = excluded.price_cents, provider_cost_cents = excluded.provider_cost_cents,
  params = excluded.params, enabled = excluded.enabled;
