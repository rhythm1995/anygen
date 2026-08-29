-- RLS：全部用户数据表基于 auth.uid()；公共表（feed/agent 配置）authenticated 可读，仅 service_role 写

alter table public.profiles enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.feed_items enable row level security;
alter table public.agent_models enable row level security;
alter table public.agent_skills enable row level security;
alter table public.projects enable row level security;
alter table public.assets enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.generation_tasks enable row level security;

-- profiles：本人读写
create policy profiles_self on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- 私有数据：本人 all
create policy ledger_self on public.credit_ledger
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy projects_self on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy assets_self on public.assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy chats_self on public.chats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy messages_self on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tasks_self on public.generation_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 公共表：authenticated 读
create policy feed_read on public.feed_items
  for select to authenticated using (true);
create policy agent_models_read on public.agent_models
  for select to authenticated using (true);
create policy agent_skills_read on public.agent_skills
  for select to authenticated using (true);

-- service_role（supabase-js service key）默认绕过 RLS，无需额外策略
