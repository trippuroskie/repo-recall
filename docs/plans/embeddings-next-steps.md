# Embeddings: Next Steps

> Get more value out of the `repo_embeddings` pgvector cache shipped in [Phase 6 of the DeepWiki-inspired plan](./deepwiki-inspired-improvements.md) (#21).

**Status:** Draft
**Created:** 2026-04-13

## Context

Phase 6 landed a persistent, commit-pinned, model-scoped pgvector cache. Today it is consumed in exactly one place: the agent's exploration loop inside an analysis. The moment the analysis ends, nothing else in the app reads from `repo_embeddings`. The only user-visible win right now is that reruns at the same commit skip embedding costs.

The roadmap below widens the blast radius so embeddings actually drive features users touch.

## Roadmap

| # | Initiative | Effort | User-visible impact | Priority |
|---|------------|--------|---------------------|----------|
| 1 | RAG-backed chat | Medium | Very High | P0 |
| 2 | Semantic search on brief pages | Low–Medium | High | P1 |
| 3 | Broader seeding coverage | Low | Medium (multiplier on #1 and #2) | P1 |
| 4 | Cross-commit reuse via content hash | Medium | Medium (cost/latency only) | P2 |

Dependencies: #3 is a force-multiplier on both #1 and #2 and should ship alongside them. #4 is independent.

---

## 1. RAG-backed chat

### Goal

When a user chats on a brief, retrieve the most relevant code chunks from `repo_embeddings` and include them in the prompt. Today chat only sees the synthesized brief text — it cannot quote or reason about code it didn't already mention.

### Approach

- Before calling the chat LLM, embed the user's message and run a pgvector nearest-neighbor query scoped to `(repo_slug)`. Use the latest `commit_sha` persisted for that repo (either join via brief metadata or store the SHA on the brief row so we can look it up in one read).
- Inject the top K (start with 5) chunks as a system-message code context block, with `path:startLine-endLine` anchors so the LLM cites them.
- Render citations in the chat UI as clickable file links (we already have a file viewer pane).
- Gracefully handle "no embeddings for this repo" — chat should still work against the brief alone.

### Files

- `src/app/api/chat/route.ts` — add retrieval step, prepend retrieved chunks to prompt
- `src/lib/agent/vectorSearch.ts` — expose a `searchByRepo(repoSlug, query, topK)` helper that queries pgvector directly (no in-memory store needed for this path)
- `src/lib/supabase/types.ts` — if we store `commit_sha` on briefs, add that column and update types
- `supabase/migrations/0XX_brief_commit_sha.sql` — optional migration if we need to persist the SHA on brief rows
- `src/components/ChatPanel.tsx` — render citations as links

### Acceptance criteria

- [ ] Chat includes code snippets for questions that aren't already answered in the brief (manual QA on 3 repos).
- [ ] Cited chunks render as clickable links that open the file pane at the correct line.
- [ ] Repos with no persisted embeddings still get working chat (no errors).
- [ ] Retrieval latency < 300ms p95 on a typical repo.

---

## 2. Semantic search on brief pages

### Goal

A search box on the brief page that lets users ask natural-language questions about the codebase and returns ranked code snippets — without going through chat.

### Approach

- New API endpoint `GET /api/briefs/[id]/search?q=...` that embeds the query (OpenRouter) and runs a pgvector `<=>` query against the cached commit for that brief.
- Small React component on the brief page: input + results list (path, line range, snippet, similarity score).
- Reuse the ivfflat index already created in migration 009 — this is what it's for.
- Cache repeat queries per (brief, query) for 5 minutes to keep OpenRouter costs down.

### Files

- `src/app/api/briefs/[id]/search/route.ts` — new route
- `src/components/BriefSearchPanel.tsx` — new component
- `src/app/brief/[id]/page.tsx` — mount the component
- `src/lib/agent/vectorSearch.ts` — shared `searchByRepo` helper (or factor into `src/lib/embeddingsQuery.ts` if we want a cleaner separation between the agent's store and query-only uses)

### Acceptance criteria

- [ ] Search returns relevant results for at least 3 test queries across 3 repos.
- [ ] Results are ranked by cosine similarity, highest first.
- [ ] Empty or repo-without-embeddings case renders a clear empty state.
- [ ] Query embedding cached per (brief, normalized query) for 5 min.

---

## 3. Broader seeding coverage

### Goal

Increase the slice of the repo that lives in `repo_embeddings` so #1 and #2 have something to retrieve. Today we seed ~14 files.

### Approach

- Extend `seedEmbeddingStore` in `src/lib/agent/orchestrator.ts` to include more high-signal categories:
  - All route handlers / API endpoints (bounded, e.g., up to 30)
  - Top-level files in `src/lib/` / `src/services/` / `src/models/`
  - Database schema / migrations
  - Any file whose path matches a "core" heuristic (not inside `node_modules`, `dist`, `.next`, `test`, `fixtures`, etc.)
- Cap total seeded files at a configurable limit (default 40) to keep the first-run embedding cost bounded.
- Accept that this slightly grows first-run cost in exchange for much better retrieval quality — once a commit is cached, reruns are free anyway.
- Optionally: add a cheap post-analysis "coverage boost" pass that embeds any remaining files under a size threshold, happening *after* the brief is saved so it doesn't extend route duration.

### Files

- `src/lib/agent/orchestrator.ts` — expand `HIGH_SIGNAL_PATTERNS` and `seedEmbeddingStore`
- Optionally a new `src/lib/agent/coverageBooster.ts` for the post-analysis pass

### Acceptance criteria

- [ ] Seed count per repo is 30–60 files (was ~14), bounded by config.
- [ ] First-run analysis time doesn't regress by more than 20%.
- [ ] Reruns are still free (no regression on Phase 6 behavior).
- [ ] Retrieval quality measurably improves on test queries (manual QA before/after).

---

## 4. Cross-commit reuse via content hash

### Goal

Today the cache key includes `commit_sha`, so any new commit invalidates the entire cache for that repo. Most commits don't change most files — we should survive them.

### Approach

- Add a `content_hash` column to `repo_embeddings` (sha256 of the chunk text) and a matching index.
- On `addDocuments`, compute the hash before embedding. Query `repo_embeddings` for existing rows with the same `(repo_slug, path, content_hash, model)`. If found, copy the embedding into the new commit's row without re-embedding.
- Keep the `(repo_slug, commit_sha, ...)` key so `loadFromDb` semantics stay clean — we just avoid embedding calls during the "populate new commit" step.
- Optional downstream: garbage-collect old `commit_sha` rows whose `content_hash` is still present under a newer SHA (dedupe storage). Defer until storage is a problem.

### Files

- `supabase/migrations/0XX_repo_embeddings_content_hash.sql` — add column + index
- `src/lib/agent/vectorSearch.ts` — hash chunks; shortcut `addDocuments` via existing-hash lookup
- `src/lib/supabase/types.ts` — type update

### Acceptance criteria

- [ ] Re-analyzing a repo after a trivial commit (one file changed) re-embeds only the changed file's chunks (verify via OpenRouter call count).
- [ ] Hash collisions are handled (astronomically unlikely for sha256, but fall back to re-embedding if the stored embedding fails to load).
- [ ] No regression in single-commit behavior.

---

## Out of scope (for this plan)

- Replacing brute-force cosine with pgvector-native ANN in the agent's in-memory store. Current chunk counts (≤ a few hundred) make this unnecessary. Revisit if the seeding expansion in #3 pushes counts past ~10k.
- Hybrid search (keyword + semantic). Possible future work once #2 ships and we can see where pure-semantic underperforms.
- Per-user embedding preferences / private repos beyond what RLS already gives us.
