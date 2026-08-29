-- CN 创作模式体系 + 美元美分计费（决策：CONCLUSIONS D2/D4/D7，内部使用无赠金无支付）
create extension if not exists pgcrypto;

-- ============ 创作类型（面板驱动源）============
create table if not exists public.creation_modes (
  key text primary key,
  label text not null,
  icon text not null default '',
  enabled boolean not null default true,
  sort integer not null default 0
);

-- ============ 模型配置（admin 可改；面板与计价的数据源）============
create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'ark',
  creation_type text not null,
  code text not null,
  display_name text not null,
  description text not null default '',
  badge text,
  unit_type text not null check (unit_type in ('per_image','per_second','per_token','per_request')),
  price_cents integer not null default 0,
  provider_cost_cents integer not null default 0,
  resolution_factor jsonb not null default '{}'::jsonb,
  params jsonb not null default '{}'::jsonb,
  sort integer not null default 0,
  is_default boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, code)
);
create index if not exists models_type_idx on public.models (creation_type, enabled, sort);

-- ============ 美分账本（替代 credit_ledger；内部使用无支付无赠金）============
create table if not exists public.ledger (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  cents integer not null,
  reason text not null check (reason in ('initial_grant','generation','generation_refund','admin_adjust','agent_step')),
  task_id uuid references public.generation_tasks(id) on delete set null,
  balance_after_cents integer not null,
  created_at timestamptz not null default now()
);
create index if not exists ledger_user_idx on public.ledger (user_id, created_at desc);

-- profiles：角色 + 美分余额（credit_* 废弃保留至 0007 清理）
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists balance_cents integer not null default 0;

-- ============ 美分 RPC（原子性/幂等语义与 0003 相同）============
create or replace function public.try_debit_cents(
  p_user uuid, p_cost integer, p_task uuid default null
) returns boolean language plpgsql as $$
declare v_ok boolean := false;
begin
  if p_cost <= 0 then raise exception 'cost must be positive'; end if;
  update public.profiles set balance_cents = balance_cents - p_cost
    where id = p_user and balance_cents >= p_cost;
  if found then
    insert into public.ledger (user_id, cents, reason, task_id, balance_after_cents)
    values (p_user, -p_cost, 'generation', p_task,
            (select balance_cents from public.profiles where id = p_user));
    v_ok := true;
  end if;
  return v_ok;
end $$;

create or replace function public.refund_cents(
  p_user uuid, p_amount integer, p_task uuid
) returns boolean language plpgsql as $$
declare v_ok boolean := false;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if exists (select 1 from public.ledger
             where user_id = p_user and task_id = p_task and reason = 'generation_refund') then
    return false;
  end if;
  update public.profiles set balance_cents = balance_cents + p_amount where id = p_user;
  if found then
    insert into public.ledger (user_id, cents, reason, task_id, balance_after_cents)
    values (p_user, p_amount, 'generation_refund', p_task,
            (select balance_cents from public.profiles where id = p_user));
    v_ok := true;
  end if;
  return v_ok;
end $$;

create or replace function public.grant_cents(
  p_user uuid, p_amount integer, p_reason text default 'initial_grant'
) returns integer language plpgsql as $$
declare v_balance integer;
begin
  insert into public.profiles (id, balance_cents) values (p_user, 0) on conflict (id) do nothing;
  update public.profiles set balance_cents = balance_cents + p_amount
    where id = p_user returning balance_cents into v_balance;
  insert into public.ledger (user_id, cents, reason, balance_after_cents)
  values (p_user, p_amount, p_reason::text, v_balance);
  return v_balance;
end $$;

-- ============ generation_tasks：模型与美分 ============
alter table public.generation_tasks
  add column if not exists model_code text not null default '',
  add column if not exists cost_cents integer not null default 0,
  add column if not exists outputs uuid[] not null default '{}';

-- ============ RLS ============
alter table public.creation_modes enable row level security;
alter table public.models enable row level security;
alter table public.ledger enable row level security;
create policy creation_modes_read on public.creation_modes for select to authenticated using (true);
create policy models_read on public.models for select to authenticated using (true);
create policy ledger_self on public.ledger for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ Admin 审计（ADMIN.md §3）============
create table if not exists public.admin_audit_log (
  id bigserial primary key,
  admin_id uuid not null,
  action text not null,
  target_table text not null default '',
  target_id text not null default '',
  diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
