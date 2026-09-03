# Contributing to RepoRecall

> [!IMPORTANT]
> **RepoRecall is not actively maintained.** There is no maintainer committed to
> reviewing issues or pull requests, and no roadmap. Nothing here promises a
> response.
>
> This document is still worth reading — but treat it as **orientation for
> working in a fork**, not as a contribution process with someone on the other
> end. Everything below (setup, conventions, the cost and timeout constraints
> around the agent loop) applies just as much to your own copy.

RepoRecall is a small project with a fairly opinionated core — an agentic
exploration loop that reads a repo through the GitHub API and synthesizes a
structured brief. Changes to that loop have real cost and latency consequences,
so the guidance below leans on those constraints more than most.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase + OpenRouter
npm run dev                  # http://localhost:3000
npm run build                # production build
npm run lint                 # ESLint
```

You will need, at minimum:

- A **Supabase** project (free tier is fine) with the migrations in
  `supabase/migrations/` applied in order, via the SQL editor or `supabase db push`.
- An **OpenRouter** API key. Exploration and synthesis both route through it.

`STRIPE_*` is only needed if you're touching billing, and `ADMIN_SECRET` only if
you're touching the admin indexing endpoint.

### Working without signing in

Set `DEV_BYPASS_AUTH=true` in `.env.local` to skip Supabase auth locally. It
substitutes a fixed mock user and is double-gated on `NODE_ENV=development`, so
it cannot be switched on in a production build. Note that the client-side nav
still renders a "Sign in" link under the bypass — only server routes are
bypassed.

## Before you ship a change

There is no test suite and no CI, so nothing catches a regression for you.
Whether you're opening a PR or just committing to your own fork, verify
manually:

- `npx tsc --noEmit` is clean. It currently reports **no errors** — keep it that way.
- `npm run build` succeeds. `next build` catches route-validation and module-resolution problems that `tsc` alone does not.
- `npm run lint` reports no *new* problems. There is currently a baseline of
  **6 errors and 12 warnings**, all pre-existing:
  - `prefer-const` in `vectorSearch.ts:418` and `github.ts:397` (trivially fixable with `--fix`)
  - `react-hooks` violations in `AnalysisProgress.tsx:22`, `ChatPanel.tsx:76` (synchronous `setState` in an effect), `MermaidChart.tsx:66` (memoization not preserved), and `TimelineSection.tsx:345` (reassignment after render)
  - the rest are unused-variable warnings

  These are worth fixing in a fork — the React Compiler ones are real
  correctness smells, not just lint noise. Note that ESLint ignores
  `.claude/**` and `.cursor/**`; agent tooling sometimes checks out copies of
  the repo there, and linting them buries the real output.
- The view you touched renders both **with** a brief and in its **empty state** — empty states are easy to break.
- No `.env.local`, API key, or real brief output is in the diff.

If you touched `src/lib/agent/`, also state in the PR:

- Roughly how many additional GitHub API calls and LLM calls your change costs. There is a hard per-analysis API budget in `executor.ts`, and the analyze route has a **300s** ceiling on Vercel (`maxDuration`). Deep mode's internal deadline (`DEEP_HARD_TIMEOUT_MS` in `orchestrator.ts`) must stay well under it.
- Whether you ran a real end-to-end analysis, and against which repo.

If you added a migration, say so in the PR body with a reminder to apply it, and
update `src/lib/supabase/types.ts` to match — that `Database` type is
hand-maintained.

## Security ground rules

- **Never commit a real key.** `.gitignore` covers `.env` and every `.env.*`
  variant except `.env.example` — don't weaken it.
- **Respect the server/client split.** Anything touching
  `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, Stripe secrets, or an
  Octokit instance holding a user token must stay server-side. Client code uses
  `createClient()` (anon key) only. `createServiceClient()` bypasses row-level
  security — never reach for it to work around an RLS policy that's
  inconvenient; fix the policy.
- **Don't add code that logs a key or a user's GitHub token**, and don't send
  either anywhere other than the provider it belongs to.
- **Analytics stay opt-in.** The Umami snippet in `src/app/layout.tsx` requires
  both `NEXT_PUBLIC_UMAMI_SCRIPT_URL` and `NEXT_PUBLIC_UMAMI_WEBSITE_ID` to be
  set. Don't hardcode a default endpoint — a fork should ship with no tracking.
- **Don't paste real brief output into an issue** without reading it first. A
  brief quotes source from whatever repo was analyzed, which may be private.

**There is no security response process.** Since the project is unmaintained,
assume no patch is coming: if you self-host, you own the security posture of
your deployment, including the known issues listed in the README. You're welcome
to open an issue describing impact without a working exploit, but treat it as a
note for other forkers rather than a report someone will action.

## Conventions

[AGENTS.md](AGENTS.md) is the short reference for project layout and the
mechanics of common changes. In brief:

- **TypeScript strict.** No `any` without a comment explaining why.
- **Database changes require a migration file** (`supabase/migrations/NNN_name.sql`). Don't rely on dashboard edits.
- **Progress reporting:** long-running flows emit `ProgressEvent`s through an `onProgress` callback rather than logging. The UI consumes them over SSE from `/api/analyze`.
- **New diagram types need two changes:** a prompt entry in `src/lib/agent/prompts.ts` and a validator branch in `orchestrator.ts`. Unvalidated Mermaid is dropped rather than rendered broken.
- **Don't expand scope.** Fix what was asked; skip the opportunistic refactor.
- Prefer editing an existing file over adding one. Flag new top-level files in the PR description.

## Worth doing in a fork

The gaps most likely to bite you, roughly in order of value:

- **Tests.** There are none. A first suite around the Mermaid validators and the brief-shape mappers in `src/lib/store.ts` would be the highest-value starting point, since both are pure and both silently degrade when wrong.
- **Cheaper analysis.** The exploration loop is the dominant cost. Better tool-call selection, smarter early stopping, or caching repeated reads across analyses all directly reduce what a run costs.
- **A worker path for large repos.** Vercel's 300s ceiling and lack of a filesystem is the binding constraint; anything requiring a real `git clone` needs separate infrastructure today.
- **Better retrieval.** `vectorSearch.ts` does brute-force cosine over in-memory chunks, with optional pgvector persistence. Chunking quality and reranking are both open ground.
- **Evaluation.** There is no way to tell whether a prompt change made briefs *better*. Even a small fixture set of repos with human-rated briefs would help.
- **Provider flexibility.** Embeddings and chat are both hardwired to OpenRouter.

## License

The project is [MIT licensed](LICENSE) — fork it, modify it, ship it. Any
contribution offered upstream is likewise taken as MIT.
