-- 0013 D13 缺口收口：generation 类型扩展、供应商/密钥、偏好、自定义技能、画布会话拆表、数字人 seed、视频续写。
-- 权威：CONCLUSIONS D13 / D7 修订 / D12⑤ v2。

-- ============ generation_tasks 类型扩到 7 创作类型 ============
alter table public.generation_tasks drop constraint if exists generation_tasks_type_check;
alter table public.generation_tasks
  add constraint generation_tasks_type_check
  check (type in ('image','video','music','dubbing','digital_human','motion_mimic','agent'));

-- ============ 供应商 + 加密密钥（ADMIN.md §3/§5；明文不入库）============
create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  protocol text not null check (protocol in ('ark','openai-compat','openmontage-bridge')),
  base_url text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  secret_encrypted text not null,
  secret_hint text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists api_keys_provider_idx on public.api_keys (provider_id, enabled);

alter table public.providers enable row level security;
alter table public.api_keys enable row level security;
-- 仅 service_role 可读写（admin API 走 service client）；authenticated 不可见密钥。

insert into public.providers (name, protocol, base_url, enabled) values
  ('ark', 'ark', 'https://ark.cn-beijing.volces.com/api/v3', true),
  ('openrouter', 'openai-compat', 'https://openrouter.ai/api/v1', true),
  ('openmontage', 'openmontage-bridge', '', true)
on conflict (name) do update set protocol = excluded.protocol, base_url = excluded.base_url;

-- ============ 全局设置（定价页：初始赠金）============
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values
  ('initial_grant_cents', '500'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

-- ============ 用户生成偏好 ============
alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;

-- ============ 自定义技能（官方行 user_id 为空）============
alter table public.agent_skills
  add column if not exists user_id uuid references public.profiles(id) on delete cascade;
create index if not exists agent_skills_user_idx on public.agent_skills (user_id);

drop policy if exists agent_skills_read on public.agent_skills;
create policy agent_skills_read on public.agent_skills
  for select to authenticated
  using (enabled = true and (user_id is null or user_id = auth.uid()));

-- ============ 画布 Agent 会话拆表（D12⑤ v2）============
alter table public.agent_sessions
  add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.agent_sessions
  add column if not exists kind text not null default 'skill';
alter table public.agent_sessions drop constraint if exists agent_sessions_kind_check;
alter table public.agent_sessions
  add constraint agent_sessions_kind_check check (kind in ('skill','canvas','free'));

-- agent_sessions 无 updated_at 时补上（0007 只有 created_at）
alter table public.agent_sessions
  add column if not exists updated_at timestamptz not null default now();
create index if not exists agent_sessions_project_idx on public.agent_sessions (project_id, updated_at desc)
  where project_id is not null;

-- ============ 数字人模型 seed（0006 只有 creation_mode）============
insert into public.models (provider, creation_type, code, display_name, description, badge, unit_type, price_cents, provider_cost_cents, resolution_factor, params, sort, is_default, enabled)
values
('ark', 'digital_human', 'digital_human_fast', '快速模式', '上传形象 + 说话内容，口型驱动数字人', null, 'per_request', 24, 14, '{}'::jsonb,
 '{"kind":"digital_human","modes":["fast"]}'::jsonb, 26, true, true)
on conflict (provider, code) do update set
  display_name = excluded.display_name, description = excluded.description,
  params = excluded.params, is_default = excluded.is_default, enabled = excluded.enabled;

-- 音乐/配音走 OpenMontage 桥：params.bridge_tool 为路由键（provider 仍 ark 作供应商标签，env/admin key 回退）
update public.models
set params = coalesce(params, '{}'::jsonb) || '{"bridge_tool":"music_gen"}'::jsonb
where code = 'seed_music_1_0_preview';

update public.models
set params = coalesce(params, '{}'::jsonb) || '{"bridge_tool":"doubao_tts"}'::jsonb
where code = 'tts_model_v3';

-- 视频续写：2.5 支持 extend
update public.models
set params = jsonb_set(params, '{reference_modes}',
  '["unified_edit","first_end_frame","smart_multi","smart_edit","long_video","extend"]'::jsonb)
where creation_type = 'video' and code = 'dreamina_seedance_45_pro';
