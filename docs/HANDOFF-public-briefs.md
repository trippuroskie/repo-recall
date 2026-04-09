# Handoff: Implement Pre-Indexed Public Briefs for Open Source Repos

## What You're Building

Add a "public briefs" system to RepoRecall so that popular open source repos are pre-indexed and browsable by **anyone without signing in**. Think DeepWiki's landing page — a grid of popular repos you can click and instantly explore. This is a top-of-funnel acquisition feature: visitors see the product's value on real repos, then sign in to analyze their own.

Read `docs/research-pre-indexed-oss-serving.md` for full research context and architectural decisions.

---

## Seed Repos (Start With These)

Index these 8 repos. All are popular, public, and relevant to LLMs/coding/agents:

| Repo | Stars | Why |
|------|-------|-----|
| `langchain-ai/langchain` | ~105k | The dominant LLM orchestration framework |
| `huggingface/transformers` | ~140k | The ML/LLM model library everyone uses |
| `openai/codex` | ~15k | OpenAI's open source coding agent |
| `All-Hands-AI/OpenHands` | ~55k | Open source AI software development platform |
| `block/goose` | ~20k | AI agent framework (Rust/TS/Python) |
| `anthropics/anthropic-cookbook` | ~15k | Claude API examples and patterns |
| `vercel/ai` | ~12k | Vercel AI SDK — the standard for AI app building |
| `ollama/ollama` | ~120k | Run LLMs locally — huge community |

---

## Architecture Summary

### Current state (everything is auth-gated)

- **Middleware** (`src/lib/supabase/middleware.ts`): Redirects unauthenticated users to `/login` for `/briefs`, `/brief/*`, and all `/api/*` routes
- **Database**: `briefs` table has `user_id` FK with RLS `auth.uid() = user_id` — only the creator can read
- **Analysis pipeline** (`src/app/api/analyze/route.ts`): Calls `requireAuth()`, uses user's GitHub token, saves to `briefs` table with `user_id`
- **Store** (`src/lib/store.ts`): All queries go through RLS-scoped Supabase client

### What you're adding

A **separate `public_briefs` table** (no `user_id`, anyone can SELECT) with new public API routes and an `/explore` frontend. Existing user briefs are untouched.

---

## Implementation Steps

### Step 1: Database Migration

Create `supabase/migrations/007_public_briefs.sql`:

```sql
create table public.public_briefs (
  id text primary key,
  repo_full_name text unique not null,
  repo_info jsonb not null,
  overview jsonb not null,
  architecture jsonb not null,
  features jsonb not null,
  business_context jsonb not null,
  timeline jsonb not null,
  entrypoints jsonb not null,
  codemap jsonb,
  timeline_data jsonb,
  diagrams jsonb,
  overview_explanation jsonb,
  stars integer not null default 0,
  language text,
  topics text[] default '{}',
  is_featured boolean default false,
  indexed_at timestamptz not null,
  last_refreshed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index public_briefs_stars_idx on public.public_briefs(stars desc);
create index public_briefs_featured_idx on public.public_briefs(is_featured) where is_featured = true;
create index public_briefs_repo_name_idx on public.public_briefs(repo_full_name);

alter table public.public_briefs enable row level security;

create policy "Anyone can read public briefs"
  on public.public_briefs for select using (true);

-- Only service_role can write (no insert/update/delete policies for anon)

create trigger public_briefs_updated_at
  before update on public.public_briefs
  for each row execute procedure public.update_updated_at();
```

Update `src/lib/supabase/types.ts` to add the `public_briefs` table type (follow the same pattern as the existing `briefs` table but with the new columns and without `user_id`).

### Step 2: Store Functions

Add to `src/lib/store.ts`:

- `getPublicBrief(repoFullName: string)` — query `public_briefs` by `repo_full_name`, return `ProjectBrief | null`. Use the **service client** (`createServiceClient()`) since anonymous users won't have an auth session to pass through RLS (the anon key with the `select using (true)` policy would also work, but the service client is simpler to set up without cookie context).
- `getAllPublicBriefs(options?: { featured?: boolean; limit?: number; offset?: number })` — list public briefs, sorted by stars desc. Filter by `is_featured` when requested.
- `savePublicBrief(brief: ProjectBrief, repoInfo: RepoInfo)` — upsert into `public_briefs` using service client. Must set `stars`, `language`, `topics`, `is_featured`, `indexed_at`, `last_refreshed_at` from the `repoInfo` fields.

Reuse the existing `rowToBrief()` helper (line ~281 of `src/lib/store.ts`) for converting DB rows to `ProjectBrief`. The public_briefs row shape is identical to briefs minus `user_id`.

### Step 3: Middleware — Allow Public Routes

In `src/lib/supabase/middleware.ts` (the `updateSession` function), the current protected route check is at lines 33-53. Modify the logic:

```typescript
// Current protected paths
const protectedPaths = ["/briefs", "/brief"];

// ADD: paths that should be accessible without auth
const publicPaths = ["/explore"];
const isPublicRoute = publicPaths.some((path) =>
  request.nextUrl.pathname.startsWith(path)
);

// Also allow /api/explore endpoints for anonymous access
const isPublicApi = request.nextUrl.pathname.startsWith("/api/explore");

// Update the existing guard:
if (!user && !devBypass && isProtectedRoute && !isPublicRoute) {
  // ... redirect to login
}

if (!user && !devBypass && isProtectedApi && !isPublicApi) {
  // ... return 401
}
```

### Step 4: API Routes

#### `src/app/api/explore/route.ts` (GET, public)

Returns list of featured public briefs. No auth required.

```
GET /api/explore?featured=true&limit=20
Response: { briefs: ProjectBrief[], total: number }
```

#### `src/app/api/explore/[owner]/[repo]/route.ts` (GET, public)

Returns a single public brief by owner/repo. No auth required.

```
GET /api/explore/langchain-ai/langchain
Response: { brief: ProjectBrief }
404 if not indexed.
```

#### `src/app/api/admin/index/route.ts` (POST, admin-only)

Triggers indexing of one or more repos. Protected by a shared secret (`ADMIN_SECRET` env var), NOT by Supabase auth (this runs as a background job or is called by an admin script).

```
POST /api/admin/index
Headers: { Authorization: "Bearer <ADMIN_SECRET>" }
Body: { "repos": ["langchain-ai/langchain", "openai/codex"] }
```

Implementation:
1. Validate the `ADMIN_SECRET` header
2. For each repo in the list:
   a. Call `fetchRepoInfo(owner, repo)` using the server `GITHUB_TOKEN` (from `src/lib/github.ts`)
   b. Call `fetchRepoTree`, `fetchPRs`, `fetchCommits`, `fetchFileContent` (for package.json + README)
   c. Run `runAgenticAnalysis()` from `src/lib/agent/orchestrator.ts` (or fall back to `generateBrief()` from `src/lib/analysis.ts`)
   d. Call `savePublicBrief()` to upsert into `public_briefs`
3. This will be slow (minutes per repo). Return `202 Accepted` immediately and process in the background, OR process sequentially and accept the long response time (Vercel max 300s). For MVP, sequential is fine since you'll run this once manually.

**Important**: The existing `runAgenticAnalysis` takes an `onProgress` callback — pass a no-op since there's no SSE stream. The `token` param should use `process.env.GITHUB_TOKEN`.

### Step 5: Frontend — Explore Page

#### `src/app/explore/page.tsx`

A new public page showing the grid of pre-indexed repos. No auth required.

- Fetch briefs from `GET /api/explore?featured=true`
- Display as a responsive grid of cards (3 columns on desktop, 2 on tablet, 1 on mobile)
- Each card shows: repo name, owner, stars, primary language, first ~100 chars of description
- Cards link to `/explore/[owner]/[repo]`
- Keep the existing `AnalyzeForm` at the top so signed-in users can still analyze custom repos
- Add "Sign in to analyze your own repos" CTA if user is not authenticated

Style to match the existing design system (Tailwind, same color tokens as `src/app/page.tsx`).

#### `src/app/explore/[owner]/[repo]/page.tsx`

A **read-only** version of the brief view. Reuse the section components from `src/components/sections/`:
- `OverviewSection`, `ArchitectureSection`, `FeaturesSection`, `BusinessSection`, `TimelineSection`, `EntrypointsSection`, `CodemapSection`

Key differences from the authenticated `src/app/brief/[id]/page.tsx`:
- **No `ChatPanel`** — add a "Sign in to chat with this codebase" CTA instead
- **No re-analyze button** — these are system-managed
- **No export** — keep it simple for anonymous users
- **No `BriefSidebar`** with user's other briefs — replace with a simpler navigation (back to `/explore`, section tabs)
- Add a banner/CTA: "Want to analyze your own repos? Sign in with GitHub"

Fetch the brief from `GET /api/explore/[owner]/[repo]`.

### Step 6: Update the Homepage

Modify `src/app/page.tsx` to show featured public repos below the existing hero + analyze form. This gives the landing page immediate value instead of being just a form.

- After the existing "What you get" features section, add a "Popular Repos" section
- Fetch from `/api/explore?featured=true&limit=6`
- Display the same card grid style as the explore page
- "View all" link to `/explore`

### Step 7: New Environment Variable

Add to `.env.example`:

```
# ─── Admin ──────────────────────────────────────────
# Secret key for admin endpoints (indexing, refresh).
# Generate with: openssl rand -hex 32
ADMIN_SECRET=
```

---

## Key Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/007_public_briefs.sql` | **New** — create table |
| `src/lib/supabase/types.ts` | Add `public_briefs` table type |
| `src/lib/store.ts` | Add `getPublicBrief`, `getAllPublicBriefs`, `savePublicBrief` |
| `src/lib/supabase/middleware.ts` | Allow `/explore` and `/api/explore` without auth |
| `src/app/api/explore/route.ts` | **New** — list public briefs |
| `src/app/api/explore/[owner]/[repo]/route.ts` | **New** — get single public brief |
| `src/app/api/admin/index/route.ts` | **New** — trigger repo indexing |
| `src/app/explore/page.tsx` | **New** — browse/discover public repos |
| `src/app/explore/[owner]/[repo]/page.tsx` | **New** — read-only public brief view |
| `src/app/page.tsx` | Add featured repos grid to homepage |
| `.env.example` | Add `ADMIN_SECRET` |

## Files NOT to Modify

- `src/app/brief/[id]/page.tsx` — leave the authenticated brief view as-is
- `src/app/api/analyze/route.ts` — the user-facing analyze endpoint stays auth-gated
- `src/lib/auth.ts` — no changes needed
- `supabase/migrations/001-006` — don't touch existing migrations

---

## Things to Watch Out For

1. **Service client for public reads**: Anonymous users have no Supabase session cookie. The public API routes need to use `createServiceClient()` (from `src/lib/supabase/server.ts`) which bypasses RLS entirely, OR create a Supabase client with just the anon key (no cookies). The RLS policy `using (true)` allows anon reads, but the cookie-based `createClient()` will fail without a request context in server components. Simplest: use `createServiceClient()` for all public_briefs reads.

2. **Next.js dynamic route conflict**: The route `src/app/explore/[owner]/[repo]/route.ts` uses two nested dynamic segments. In Next.js App Router, this needs to be `src/app/api/explore/[owner]/[repo]/route.ts` for the API and `src/app/explore/[owner]/[repo]/page.tsx` for the page. Make sure the page and API are in the right directories.

3. **Indexing timeout**: `runAgenticAnalysis` can take 1-5 minutes per repo. The admin index endpoint should handle this gracefully — either process repos sequentially (accepting long response times) or return 202 and process async. For MVP, sequential with a high timeout is fine.

4. **The `ProjectBrief` type requires an `id` field**: When saving public briefs, generate a deterministic ID from the repo name (e.g., `public-${owner}-${repo}`) so upserts work cleanly.

5. **Existing `rowToBrief` function**: It expects the private briefs DB shape. You may need a parallel `publicRowToBrief` or make `rowToBrief` flexible enough to handle both (the only difference is public rows have no `user_id` but have `stars`, `language`, `topics`, `is_featured`).
