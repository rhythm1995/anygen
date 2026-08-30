-- Agent v1：技能模板执行器（CONCLUSIONS D5）
create table if not exists public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id text not null default '',
  prompt text not null,
  plan jsonb not null default '{}'::jsonb,
  status text not null default 'planning' check (status in ('planning','running','awaiting_approval','succeeded','failed')),
  budget_cents integer not null default 0,
  spent_cents integer not null default 0,
  summary text not null default '',
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists agent_sessions_user_idx on public.agent_sessions (user_id, created_at desc);

create table if not exists public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  seq integer not null,
  title text not null default '',
  type text not null check (type in ('image','video','music','note')),
  prompt text not null,
  params jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','skipped')),
  task_id uuid references public.generation_tasks(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  error text,
  cost_cents integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists agent_steps_session_idx on public.agent_steps (session_id, seq);

-- 官方技能：挂模板（4 个官方技能已在 agent_skills）
alter table public.agent_skills
  add column if not exists official boolean not null default false,
  add column if not exists plan_template jsonb not null default '{}'::jsonb;

-- 模板语义：steps[].{title,type,prompt_suffix,count?,params?}
-- prompt = 用户输入 + prompt_suffix 组合；count>1 时按镜头序号展开
insert into public.agent_skills (id, name, title, description, enabled, official, plan_template) values
('web_agent_skill_story', '影视故事短片', '故事短片', '帮你自动生成故事大纲、分镜脚本并产出短片', true, true,
  '{"steps":[{"title":"分镜 1·开场","type":"image","prompt_suffix":"开场镜头，电影感构图，确立视觉基调","count":1,"params":{"resolution":"2k","count":1}},{"title":"分镜 2·发展","type":"image","prompt_suffix":"发展镜头，推进叙事张力","count":1,"params":{"resolution":"2k","count":1}},{"title":"分镜 3·高潮","type":"image","prompt_suffix":"高潮镜头，戏剧性光线与构图","count":1,"params":{"resolution":"2k","count":1}},{"title":"分镜 4·收尾","type":"image","prompt_suffix":"收尾镜头，留白与余韵","count":1,"params":{"resolution":"2k","count":1}}]}'::jsonb),
('web_agent_skill_ecommerce', '电商套图', '电商套图', '生成风格统一的商品全套视觉素材', true, true,
  '{"steps":[{"title":"主图","type":"image","prompt_suffix":"电商商品主图，纯色背景，居中构图，专业布光","count":1,"params":{"resolution":"2k","count":1}},{"title":"细节图","type":"image","prompt_suffix":"商品细节特写，质感表现","count":1,"params":{"resolution":"2k","count":1}},{"title":"场景图","type":"image","prompt_suffix":"商品使用场景图，生活方式呈现","count":1,"params":{"resolution":"2k","count":1}}]}'::jsonb),
('web_agent_skill_poster', '海报设计', '海报设计', '生成更有创意的海报内容，擅长营销场景和节日热点', true, true,
  '{"steps":[{"title":"海报方案 A","type":"image","prompt_suffix":"海报主视觉方案A，强构图，信息层级清晰","count":1,"params":{"resolution":"2k","count":1}},{"title":"海报方案 B","type":"image","prompt_suffix":"海报主视觉方案B，另一创意方向","count":1,"params":{"resolution":"2k","count":1}}]}'::jsonb),
('web_agent_skill_brand', 'Logo设计', 'Logo设计', '根据公司名称、业务与客群，生成品牌 Logo 与视觉方案', true, true,
  '{"steps":[{"title":"Logo 方向 A","type":"image","prompt_suffix":"Logo 设计方向A，简洁几何，单色","count":1,"params":{"resolution":"2k","count":1}},{"title":"Logo 方向 B","type":"image","prompt_suffix":"Logo 设计方向B，字形结合","count":1,"params":{"resolution":"2k","count":1}},{"title":"品牌色板","type":"image","prompt_suffix":"品牌色板与应用示例","count":1,"params":{"resolution":"2k","count":1}}]}'::jsonb)
on conflict (id) do update set official = excluded.official, plan_template = excluded.plan_template,
  title = excluded.title, description = excluded.description;

-- RLS
alter table public.agent_sessions enable row level security;
alter table public.agent_steps enable row level security;
create policy agent_sessions_self on public.agent_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy agent_steps_read on public.agent_steps for select using (true);
