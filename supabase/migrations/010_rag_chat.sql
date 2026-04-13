-- RAG-backed chat (initiative #1 of docs/plans/embeddings-next-steps.md).
--
-- 1. Persist the analyzed commit SHA on each brief so chat can scope vector
--    retrieval to the same (repo_slug, commit_sha) the agent embedded against.
-- 2. Expose a SECURITY DEFINER RPC for cosine nearest-neighbor search over
--    repo_embeddings. RLS on repo_embeddings only permits the service role,
--    so an RPC keeps retrieval server-side without forcing every chat call
--    to ship its own service-role client.
-- 3. Backfill the model column into the unique constraint for any
--    environment that applied an early version of migration 009 before
--    `model` was added to the key. Drop+add is idempotent in practice
--    because the new constraint subsumes the old one.

-- ── 1. commit_sha on briefs ────────────────────────────────────────────────

alter table public.briefs
  add column if not exists commit_sha text;

alter table public.public_briefs
  add column if not exists commit_sha text;

-- ── 2. match_repo_embeddings RPC ───────────────────────────────────────────

create or replace function public.match_repo_embeddings(
  query_embedding vector(256),
  repo text,
  sha text,
  match_count int default 5
)
returns table (
  path text,
  start_line int,
  end_line int,
  snippet text,
  content text,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    path,
    start_line,
    end_line,
    snippet,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from public.repo_embeddings
  where repo_slug = repo
    and commit_sha = sha
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Lock the RPC down to the service role. The function is SECURITY DEFINER so
-- it intentionally bypasses repo_embeddings RLS — but the table is keyed only
-- by (repo_slug, commit_sha, ...), with no user_id. If anon/authenticated
-- could invoke this RPC directly with the public key, they could enumerate
-- chunk content (and embeddings) for any repo any user has analyzed,
-- including private ones. Callers (e.g. the chat route) must go through a
-- server-side createServiceClient() that holds the service role key.
revoke execute on function public.match_repo_embeddings(vector(256), text, text, int)
  from public;
revoke execute on function public.match_repo_embeddings(vector(256), text, text, int)
  from anon, authenticated;
grant execute on function public.match_repo_embeddings(vector(256), text, text, int)
  to service_role;

-- ── 3. Reproducibly add `model` to the unique constraint ───────────────────

alter table public.repo_embeddings
  drop constraint if exists repo_embeddings_unique_chunk;

alter table public.repo_embeddings
  add constraint repo_embeddings_unique_chunk
  unique (repo_slug, commit_sha, path, start_line, model);
