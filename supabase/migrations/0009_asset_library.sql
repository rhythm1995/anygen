-- D8 资产库完整版：收藏 / 发布标记（批量操作栏与筛选面板依赖）
alter table public.assets
  add column if not exists favorited boolean not null default false,
  add column if not exists published boolean not null default false;

create index if not exists assets_user_favorited_idx on public.assets (user_id, favorited, created_at desc);
