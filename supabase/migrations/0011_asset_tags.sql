-- D11 资产自定义标签：用户可给资产打标签并按 tag 筛选
alter table public.assets
  add column if not exists tags text[] not null default '{}';

create index if not exists assets_tags_idx on public.assets using gin (tags);

-- 用户全量去重标签（GET /api/assets/tags；service_role 专用）
create or replace function public.asset_distinct_tags(p_user uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct t), '{}') from public.assets a, unnest(a.tags) t where a.user_id = p_user;
$$;
revoke all on function public.asset_distinct_tags(uuid) from anon, authenticated;
