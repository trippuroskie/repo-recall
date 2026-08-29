# RepoRecall

Next.js App Router app that generates structured project briefs from GitHub repositories (overview, architecture, features, business context, timeline, entrypoints, and chat).

## Layout

- `src/app/` — routes and API handlers
- `src/lib/agent/` — agentic analysis (orchestrator, tools, embeddings)
- `src/lib/store.ts` — Supabase persistence
- `supabase/migrations/` — apply in numeric order
- `docs/` — product and architecture notes (some are historical)

## Local notes

- Copy `.env.example` to `.env.local`. Never commit secrets.
- `DEV_BYPASS_AUTH=true` only works when `NODE_ENV=development`.
- Billing and GitHub OAuth tokens are written with the service-role client. Do not add client-side writes to `profiles.github_access_token`, `stripe_customer_id`, or `subscription_status`.
