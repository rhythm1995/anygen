-- =============================================================================
-- Optional: pgvector embeddings for semantic knowledge search.
-- Only runs where the `vector` extension is available (Supabase local/cloud,
-- or any Postgres with pgvector installed). Safe to skip on plain Postgres.
-- =============================================================================
create extension if not exists vector;

alter table public.knowledge_items
  add column if not exists embedding vector(1536);

create or replace function public.match_knowledge(
  query_embedding vector(1536),
  match_count int default 5,
  filter_org uuid default null
)
returns table (
  id uuid,
  title text,
  content text,
  similarity float
)
language sql stable as $$
  select
    k.id,
    k.title,
    k.content,
    1 - (k.embedding <=> query_embedding) as similarity
  from public.knowledge_items k
  where k.embedding is not null
    and (filter_org is null or k.org_id = filter_org)
  order by k.embedding <=> query_embedding
  limit match_count;
$$;
