-- 生成任务产物（asset id 列表）
alter table public.generation_tasks
  add column if not exists outputs uuid[] not null default '{}';
