-- D10 用户洞察：per-user 聚合 RPC（API GET /api/admin/insights/* 的数据源）
-- 仅授权 service_role（API 层 AdminGuard 把关）；anon/authenticated 一律拒绝
create or replace function public.admin_user_stats(p_user uuid default null)
returns table (
  user_id uuid,
  tasks_total bigint,
  tasks_succeeded bigint,
  tasks_failed bigint,
  tasks_image bigint,
  tasks_video bigint,
  spend_cents bigint,
  refund_cents bigint,
  granted_cents bigint,
  agent_sessions bigint,
  agent_spent_cents bigint,
  assets bigint,
  projects bigint,
  chats bigint
)
language sql stable security definer set search_path = public as $$
  select
    p.id as user_id,
    (select count(*) from public.generation_tasks t where t.user_id = p.id),
    (select count(*) from public.generation_tasks t where t.user_id = p.id and t.status = 'succeeded'),
    (select count(*) from public.generation_tasks t where t.user_id = p.id and t.status = 'failed'),
    (select count(*) from public.generation_tasks t where t.user_id = p.id and t.type = 'image'),
    (select count(*) from public.generation_tasks t where t.user_id = p.id and t.type = 'video'),
    (select -coalesce(sum(l.cents), 0) from public.ledger l where l.user_id = p.id and l.reason = 'generation'),
    (select coalesce(sum(l.cents), 0) from public.ledger l where l.user_id = p.id and l.reason = 'generation_refund'),
    (select coalesce(sum(l.cents), 0) from public.ledger l where l.user_id = p.id and l.reason in ('initial_grant', 'admin_adjust')),
    (select count(*) from public.agent_sessions s where s.user_id = p.id),
    (select coalesce(sum(s.spent_cents), 0) from public.agent_sessions s where s.user_id = p.id),
    (select count(*) from public.assets a where a.user_id = p.id),
    (select count(*) from public.projects pr where pr.user_id = p.id),
    (select count(*) from public.chats c where c.user_id = p.id)
  from public.profiles p
  where p_user is null or p.id = p_user;
$$;

revoke execute on function public.admin_user_stats(uuid) from public, anon, authenticated;
