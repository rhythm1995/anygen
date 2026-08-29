-- 积分原子操作 RPC（supabase-js 无事务，用 DB 函数保证原子性）

-- 原子扣减：余额足够才扣，返回是否成功
create or replace function public.try_debit_credit(
  p_user uuid,
  p_cost integer,
  p_task uuid default null
) returns boolean
language plpgsql
as $$
declare
  v_ok boolean := false;
begin
  if p_cost <= 0 then
    raise exception 'cost must be positive';
  end if;

  update public.profiles
    set credit_balance = credit_balance - p_cost
    where id = p_user and credit_balance >= p_cost;

  if found then
    insert into public.credit_ledger (user_id, delta, reason, task_id, balance_after)
    values (p_user, -p_cost, 'generation_consume', p_task,
            (select credit_balance from public.profiles where id = p_user));
    v_ok := true;
  end if;
  return v_ok;
end $$;

-- 退款：按任务幂等（同任务同原因只退一次）
create or replace function public.refund_credit(
  p_user uuid,
  p_amount integer,
  p_task uuid
) returns boolean
language plpgsql
as $$
declare
  v_ok boolean := false;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  -- 幂等：该任务已有退款流水则拒绝
  if exists (select 1 from public.credit_ledger
             where user_id = p_user and task_id = p_task and reason = 'generation_refund') then
    return false;
  end if;

  update public.profiles
    set credit_balance = credit_balance + p_amount
    where id = p_user;

  if found then
    insert into public.credit_ledger (user_id, delta, reason, task_id, balance_after)
    values (p_user, p_amount, 'generation_refund', p_task,
            (select credit_balance from public.profiles where id = p_user));
    v_ok := true;
  end if;
  return v_ok;
end $$;

-- 入账（注册奖励/充值）：不存在 profile 时先建
create or replace function public.grant_credit(
  p_user uuid,
  p_amount integer,
  p_reason text default 'topup'
) returns integer
language plpgsql
as $$
declare
  v_balance integer;
begin
  insert into public.profiles (id, credit_balance) values (p_user, 0)
  on conflict (id) do nothing;

  update public.profiles
    set credit_balance = credit_balance + p_amount
    where id = p_user
  returning credit_balance into v_balance;

  insert into public.credit_ledger (user_id, delta, reason, balance_after)
  values (p_user, p_amount, p_reason, v_balance);

  return v_balance;
end $$;
