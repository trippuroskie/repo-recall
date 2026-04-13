-- Phase 6: Persist EmbeddingStore contents in pgvector.
--
-- Rationale: the in-memory EmbeddingStore (src/lib/agent/vectorSearch.ts) is
-- rebuilt from scratch on every analysis. Re-running the same repo at the same
-- commit re-embeds every chunk unnecessarily. This migration adds a cache
-- keyed by (repo_slug, commit_sha, path, start_line) so reruns skip
-- re-embedding entirely.
--
-- Search stays in-memory cosine for now; the ivfflat index below is prep for
-- a future swap to pgvector-native ANN once chunk counts justify it.

-- Supabase supports pgvector natively; this is idempotent.
create extension if not exists vector;

create table if not exists public.repo_embeddings (
  id uuid primary key default gen_random_uuid(),
  repo_slug text not null,
  commit_sha text not null,
  path text not null,
  start_line int not null,
  end_line int not null,
  snippet text not null,
  content text not null,
  embedding vector(256) not null,
  model text not null default 'openai/text-embedding-3-small',
  created_at timestamptz not null default now(),
  -- Model is part of the uniqueness key so swapping the embedding model
  -- writes fresh rows instead of colliding with the prior model's
  -- embeddings (which live in a different vector space and can't be
  -- compared against a new query embedding).
  constraint repo_embeddings_unique_chunk
    unique (repo_slug, commit_sha, path, start_line, model)
);

-- Fast lookup of all chunks for a given (repo, commit) when loading the store.
create index if not exists repo_embeddings_repo_commit_idx
  on public.repo_embeddings (repo_slug, commit_sha);

-- Prep for future pgvector-native ANN search. Safe to create now; unused
-- until the application calls `embedding <=> $1` directly.
create index if not exists repo_embeddings_embedding_idx
  on public.repo_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Writes are server-only via the service role key. No client access.
alter table public.repo_embeddings enable row level security;
