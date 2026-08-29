-- Dreamina clone · initial schema
-- 依据 docs/DATA-MODEL.md（证据：dreamina-clone/RECON 的原站 API fixtures）

create extension if not exists "pgcrypto";

-- ============ profiles ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  avatar_url text not null default '',
  description text not null default '',
  credit_balance integer not null default 0,
  created_at timestamptz not null default now()
);

-- ============ credit_ledger ============
create table if not exists public.credit_ledger (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('signup_bonus','generation_consume','generation_refund','topup')),
  task_id uuid,
  balance_after integer not null,
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);

-- ============ feed_items ============
create table if not exists public.feed_items (
  id text primary key,
  title text not null default '',
  cover_url text not null,
  width integer not null default 0,
  height integer not null default 0,
  author_name text not null default '',
  author_avatar text not null default '',
  model_req_key text not null default '',
  generate_type text not null default 'text2image',
  sort_key bigserial
);
create index if not exists feed_items_sort_idx on public.feed_items (sort_key);

-- ============ agent config（seed 静态）============
create table if not exists public.agent_models (
  key text primary key,
  name text not null,
  kind text not null check (kind in ('image','video')),
  is_default boolean not null default false
);

create table if not exists public.agent_skills (
  id text primary key,
  name text not null,
  title text not null default '',
  description text not null default '',
  enabled boolean not null default true
);

-- ============ projects（画布）============
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'New project',
  thumbnail_url text,
  graph jsonb not null default '{}'::jsonb,
  graph_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_user_idx on public.projects (user_id, updated_at desc);

-- ============ assets ============
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('image','video','audio','doc','element')),
  storage_key text not null unique,
  url text not null,
  mime text not null default '',
  width integer,
  height integer,
  size_bytes integer,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists assets_user_kind_idx on public.assets (user_id, kind, created_at desc);

-- ============ chats / messages ============
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chats_user_idx on public.chats (user_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null default '',
  task_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists messages_chat_idx on public.messages (chat_id, created_at);

-- ============ generation_tasks ============
create table if not exists public.generation_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('image','video')),
  prompt text not null,
  params jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  remote_id text,
  error text,
  cost integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists generation_tasks_user_idx on public.generation_tasks (user_id, status, created_at desc);

-- credit_ledger.task_id 引用 generation_tasks，需在任务表之后补外键
alter table public.credit_ledger
  add constraint credit_ledger_task_fk
  foreign key (task_id) references public.generation_tasks(id) on delete set null;

-- ============ 触发器：updated_at ============
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger chats_set_updated_at before update on public.chats
  for each row execute function public.set_updated_at();
