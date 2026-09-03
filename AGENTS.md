# AGENTS.md

Guidance for AI coding agents (Claude Code, Cursor, etc.) working in this repo. Human contributors should also skim this.

> **This project is not actively maintained.** Assume you are working in a fork
> with no upstream review. The conventions below still apply — they encode real
> constraints (the 300s route budget, the GitHub API budget, the server/client
> secret split), not a maintainer's preferences. "Before opening a PR" below is
> a self-check, not a submission process.

## What this app is

RepoRecall is a Next.js 16 app that analyzes GitHub repos by running an **agentic exploration loop** (an LLM calls tools like `readFile`, `searchCode`, `searchSemantic`, `listDirectory` against the GitHub API), then synthesizes findings into a structured `ProjectBrief`. Briefs are persisted in Supabase; a curated public variant lives in the `public_briefs` table.

## Commands

```
npm run dev       # Next dev server
npm run build     # Production build (run before opening a PR touching runtime code)
npm run lint      # ESLint
```

Typecheck without building: `npx tsc --noEmit`.

## Layout (only the non-obvious bits)

- `src/lib/agent/` — the exploration loop. Start here if you're touching analysis behavior.
  - `orchestrator.ts` — top-level `runAgenticAnalysis`; standard vs deep mode; seeds the embedding store; calls synthesis.
  - `executor.ts` — `ToolExecutor` that turns LLM tool calls into GitHub API calls (and semantic search).
  - `tools.ts` — tool schemas exposed to the LLM.
  - `prompts.ts` — exploration, synthesis, gap-analysis prompts.
  - `vectorSearch.ts` — `EmbeddingStore`: code-aware chunking, OpenRouter embeddings, brute-force cosine. Optionally persisted via pgvector (migration `009`).
- `src/lib/supabase/` — `server.ts` exposes `createClient()` (user-scoped) and `createServiceClient()` (server-only, service role). `types.ts` is the hand-maintained `Database` type.
- `src/lib/store.ts` — brief read/write against Supabase.
- `supabase/migrations/` — numbered SQL migrations. Add new ones as `NNN_name.sql`; apply via Supabase SQL editor or `supabase db push`.
- `src/app/api/analyze/` — entry point for an analysis; enforces `maxDuration = 300` on Vercel. Deep mode's deadline must stay well under this — see `DEEP_HARD_TIMEOUT_MS` in `orchestrator.ts`.
- `docs/plans/` — roadmap docs. `deepwiki-inspired-improvements.md` tracks phased improvements and which have shipped.

## Conventions

- **TypeScript strict.** No `any` unless there's a comment explaining why.
- **Server vs client.** Anything touching `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, Stripe secrets, or Octokit with a user token must stay server-side. Client code uses `createClient()` (anon key) only.
- **Database changes require a migration file.** Don't rely on Supabase dashboard edits. Update `src/lib/supabase/types.ts` to match.
- **Progress events.** Long-running flows emit `ProgressEvent`s via an `onProgress` callback rather than logging. The UI subscribes via SSE in `/api/analyze`.
- **Don't expand scope.** Fix what was asked; don't opportunistically refactor, reformat, or "improve" surrounding code.
- **Prefer editing over creating files.** New top-level docs or helper files should be rare — flag them in the PR description.
- **Run `npm run build` before opening a PR** if runtime code changed. `next build` catches issues `tsc` misses (route validation, module resolution).

## Gotchas

- Vercel serverless: no filesystem persistence, 300s max duration on analyze. Anything requiring a real filesystem (local git clone, etc.) isn't viable without separate worker infra.
- OpenRouter vs OpenAI: embeddings and chat both go through OpenRouter. The embedding endpoint is `openai/text-embedding-3-small` at 256 dims; changing dims requires migrating pgvector column width.
- Rate limits: GitHub unauthenticated is 60 req/hr. The agent has a hard API-call budget (`executor.ts`) — don't casually raise it without thinking about route duration.
- Mermaid diagrams from synthesis are validated in `orchestrator.ts` before being included in the brief. New diagram types need both a prompt entry and a validator branch.

## Before opening a PR

1. `npx tsc --noEmit` clean on files you touched.
2. `npm run build` succeeds.
3. If you touched `src/lib/agent/`, briefly think about the 300s Vercel budget and the 120-call GitHub API budget.
4. If you added a migration, note it in the PR body with a reminder to apply it.
5. Small, focused commits; PR description explains the *why*, not just the *what*.
