-- =============================================================================
-- Helix core schema (migration 0001)
-- -----------------------------------------------------------------------------
-- Standalone-safe: no Supabase auth.* references, no RLS, no extensions.
-- Runs on `supabase db push` / `supabase start` AND on any plain Postgres
-- (including the docker-compose service). For multi-tenant production, enable
-- RLS and scope by org_id / auth.uid().
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- orgs
-- ---------------------------------------------------------------------------
create table if not exists public.orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- brand_profiles  (org-level brand voice + compliance glossary → eve skills)
-- ---------------------------------------------------------------------------
create table if not exists public.brand_profiles (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  name            text not null,
  brand_voice     text not null default '',
  target_audience text,
  do_phrases      text[] not null default '{}',
  dont_phrases    text[] not null default '{}',
  glossary        jsonb   not null default '{}'::jsonb,
  disclaimers     text[] not null default '{}',
  target_markets  text[] not null default '{}',
  default_language text   not null default 'en',
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- knowledge_items  (素材库) — queried by the agent via query_kb
-- embedding column added in 0002_embeddings.sql (optional, pgvector)
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_items (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  type       text not null check (type in ('doc','fact','faq','product','competitor','market_data')),
  title      text not null,
  content    text not null,
  source_url text,
  tags       text[] not null default '{}',
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists knowledge_items_org_idx on public.knowledge_items(org_id);
create index if not exists knowledge_items_tags_idx on public.knowledge_items using gin(tags);
create index if not exists knowledge_items_fts_idx on public.knowledge_items
  using gin(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,'')));

-- ---------------------------------------------------------------------------
-- compliance_terms  (banned / restricted / required phrasing)
-- ---------------------------------------------------------------------------
create table if not exists public.compliance_terms (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  term       text not null,
  category   text not null check (category in ('banned','restricted','required')),
  severity   text not null default 'medium' check (severity in ('low','medium','high')),
  reason     text,
  replacement text,
  created_at timestamptz not null default now()
);
create index if not exists compliance_terms_org_idx on public.compliance_terms(org_id);

-- ---------------------------------------------------------------------------
-- briefs  (a content request)
-- ---------------------------------------------------------------------------
create table if not exists public.briefs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  title          text not null,
  content_type   text not null,
  language       text not null default 'en',
  audience       text,
  key_points     text[] not null default '{}',
  keywords       text[] not null default '{}',
  "references"   text[] not null default '{}',
  notes          text,
  target_channel text,
  status         text not null default 'pending' check (status in ('pending','generating','done','failed')),
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists briefs_org_idx on public.briefs(org_id);

-- ---------------------------------------------------------------------------
-- content_items  (produced content)
-- ---------------------------------------------------------------------------
create table if not exists public.content_items (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  brief_id        uuid references public.briefs(id) on delete set null,
  content_type    text not null,
  title           text not null,
  slug            text,
  summary         text,
  body_markdown   text not null,
  body_html       text,
  language        text not null default 'en',
  status          text not null default 'draft' check (status in ('draft','reviewing','approved','published','rejected','archived')),
  meta_description text,
  tags            text[] not null default '{}',
  geo             jsonb,
  compliance      jsonb,
  model_used      text,
  agent_run_id    text,
  tokens_used     integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  published_at    timestamptz
);
create index if not exists content_items_org_idx on public.content_items(org_id);
create index if not exists content_items_brief_idx on public.content_items(brief_id);
create index if not exists content_items_status_idx on public.content_items(status);

-- ---------------------------------------------------------------------------
-- content_jobs  (batch generation)
-- ---------------------------------------------------------------------------
create table if not exists public.content_jobs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  brief_ids   text[] not null default '{}',
  status      text not null default 'queued' check (status in ('queued','running','completed','failed','partial')),
  total       integer not null default 0,
  done        integer not null default 0,
  failed      integer not null default 0,
  config      jsonb not null default '{}'::jsonb,
  results     jsonb not null default '{}'::jsonb,
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists content_jobs_org_idx on public.content_jobs(org_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists briefs_touch on public.briefs;
create trigger briefs_touch before update on public.briefs
  for each row execute function public.touch_updated_at();

drop trigger if exists content_items_touch on public.content_items;
create trigger content_items_touch before update on public.content_items
  for each row execute function public.touch_updated_at();

drop trigger if exists brand_profiles_touch on public.brand_profiles;
create trigger brand_profiles_touch before update on public.brand_profiles
  for each row execute function public.touch_updated_at();
