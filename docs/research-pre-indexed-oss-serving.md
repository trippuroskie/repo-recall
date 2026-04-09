# Research: Serving Pre-Indexed Open Source Codebases (DeepWiki-Style)

## Executive Summary

This document investigates how RepoRecall could serve pre-indexed open source codebases to anonymous users before they sign in with GitHub — similar to how DeepWiki provides instant wiki-style documentation for popular repositories.

The core idea: **maintain a curated library of pre-analyzed popular repos that anyone can browse, search, and learn from without authentication**, turning the landing page from a form into a discovery experience.

---

## How DeepWiki Does It

### Pre-Indexing at Scale
- Cognition AI pre-indexed **50,000+ popular GitHub repos**, analyzing **4 billion lines of code** at a cost of ~$300K in compute
- Popular repos load instantly (already indexed); obscure repos take a few minutes on first access
- URL-based access: users replace `github.com` with `deepwiki.com` in any repo URL — no sign-in required

### What Gets Generated
- Architecture diagrams (Mermaid.js)
- Module-level documentation (plain-English summaries per directory/file)
- Function and class explanations with inline source references
- Dependency maps
- Getting started summaries (distilled from READMEs)

### Access Model
- **Full anonymous access** for all public repos — no login wall
- Interactive RAG-powered Q&A on any repo
- MCP server for programmatic access (free)
- Developers can customize generation via `.devin/wiki.json`

### Key Comparison

| Aspect | DeepWiki | Sourcegraph | GitHub Search |
|--------|----------|-------------|---------------|
| Anonymous access | Yes (full) | Yes (for OSS) | No (requires login) |
| Pre-indexed repos | 50K+ | 2M+ | All repos |
| AI-generated docs | Yes | No | No |
| Primary value | Documentation/understanding | Code search | Code search |

---

## Current RepoRecall Architecture (What Needs to Change)

### Current State: Everything Is User-Scoped

1. **Auth wall**: Middleware redirects unauthenticated users to `/login` for all `/briefs`, `/brief/*`, and `/api/*` routes
2. **Database**: All briefs have `user_id` FK with RLS policies like `auth.uid() = user_id` — only the creator can read their own briefs
3. **Analysis**: Requires authenticated user (`requireAuth()` in `/api/analyze`) — uses user's GitHub token
4. **No public concept**: No `is_public` flag, no system/service user, no anonymous read path

### Gap Analysis

| Capability | Current | Needed |
|-----------|---------|--------|
| Anonymous brief viewing | None | Public briefs readable without auth |
| Public briefs in DB | None | `public_briefs` table or `is_public` flag |
| Pre-indexing pipeline | None | Background job to index popular repos |
| Discovery UI | Form only | Grid of featured repos on landing page |
| URL-based access | `/brief/[uuid]` | `/explore/[owner]/[repo]` |
| Search across public briefs | None | Full-text or simple search |
| Rate limiting for anonymous | None | Needed for public API endpoints |

---

## Proposed Architecture

### Option A: Separate `public_briefs` Table (Recommended)

Keep user briefs and public briefs completely separate. Simpler RLS, no risk of accidentally exposing user data, and public briefs can have different schema/lifecycle.

```sql
-- New table for pre-indexed public repo briefs
create table public.public_briefs (
  id text primary key,
  repo_full_name text unique not null,      -- e.g., "facebook/react"
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
  stars integer not null default 0,         -- for sorting/filtering
  language text,                            -- primary language
  topics text[] default '{}',              -- for category filtering
  indexed_at timestamptz not null,
  last_refreshed_at timestamptz not null,
  refresh_interval_days integer default 30, -- how often to re-index
  is_featured boolean default false,        -- show on homepage grid
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for discovery
create index public_briefs_stars_idx on public.public_briefs(stars desc);
create index public_briefs_language_idx on public.public_briefs(language);
create index public_briefs_featured_idx on public.public_briefs(is_featured) where is_featured = true;
create index public_briefs_repo_name_idx on public.public_briefs(repo_full_name);

-- Full-text search index
alter table public.public_briefs add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(repo_full_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(repo_info->>'description', '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(topics, ' '), '')), 'C')
  ) stored;
create index public_briefs_search_idx on public.public_briefs using gin(search_vector);

-- RLS: anyone can read, only service role can write
alter table public.public_briefs enable row level security;

create policy "Anyone can read public briefs"
  on public.public_briefs for select
  using (true);

-- No insert/update/delete policies for anon — only service_role can write
```

### Option B: Add `is_public` Flag to Existing `briefs` Table

Simpler migration but mixes public and private data. Requires careful RLS updates.

```sql
alter table public.briefs add column is_public boolean default false;

-- Update RLS to allow anonymous reads for public briefs
create policy "Anyone can read public briefs"
  on public.briefs for select
  using (is_public = true or auth.uid() = user_id);
```

**Recommendation: Option A.** The separation is cleaner — public briefs are a fundamentally different concept (system-owned, auto-refreshed, different lifecycle). Mixing them with user briefs creates complexity in every query, export, and billing check.

---

## Implementation Plan

### Phase 1: Database & API Layer

#### 1.1 Migration: `public_briefs` table
Create `supabase/migrations/007_public_briefs.sql` with the schema above.

#### 1.2 New Store Functions (`src/lib/store.ts`)

```typescript
// Public brief operations (use service client for writes, anon for reads)
export async function getPublicBrief(repoFullName: string): Promise<ProjectBrief | null>
export async function getAllPublicBriefs(options?: {
  featured?: boolean;
  language?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ briefs: ProjectBrief[]; total: number }>
export async function savePublicBrief(brief: ProjectBrief): Promise<void>
export async function refreshPublicBrief(repoFullName: string): Promise<void>
```

#### 1.3 New API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/explore` | GET | Public | List featured/searchable public briefs |
| `/api/explore/[owner]/[repo]` | GET | Public | Get a specific public brief |
| `/api/admin/index` | POST | Service key | Trigger indexing of a repo (admin only) |
| `/api/admin/refresh` | POST | Service key | Refresh stale public briefs |

#### 1.4 Middleware Updates

```typescript
// In src/lib/supabase/middleware.ts — add public routes
const publicPaths = ["/explore", "/api/explore"];
const isPublicRoute = publicPaths.some((path) =>
  request.nextUrl.pathname.startsWith(path)
);

// Don't redirect to login for public routes
if (!user && !devBypass && !isPublicRoute && isProtectedRoute) {
  // ... existing redirect logic
}
```

### Phase 2: Pre-Indexing Pipeline

#### 2.1 Indexing Script / Admin Endpoint

A background process that:
1. Takes a list of `owner/repo` strings
2. For each, runs the existing analysis pipeline using the server-side `GITHUB_TOKEN`
3. Saves results to `public_briefs` table via service client
4. Marks as `is_featured` if in the curated list

```
POST /api/admin/index
Authorization: Bearer <ADMIN_SECRET>
Body: { "repos": ["facebook/react", "vercel/next.js", ...] }
```

#### 2.2 Curated Repo List (Seed Data)

Start with ~50-100 high-value repos across categories:

| Category | Example Repos |
|----------|--------------|
| Frontend | facebook/react, vuejs/vue, sveltejs/svelte, angular/angular |
| Fullstack | vercel/next.js, remix-run/remix, nuxt/nuxt, astro/astro |
| Backend | expressjs/express, fastify/fastify, pallets/flask, django/django |
| AI/ML | langchain-ai/langchain, huggingface/transformers, openai/openai-python |
| DevTools | denoland/deno, oven-sh/bun, biomejs/biome, esbuild/esbuild |
| Infra | supabase/supabase, prisma/prisma, drizzle-team/drizzle-orm |
| AI Agents | openai/codex, All-Hands-AI/OpenHands, block/goose |
| Databases | redis/redis, cockroachdb/cockroach, tikv/tikv |

#### 2.3 Refresh Strategy

- **Cron job** (Vercel cron or external): Check `public_briefs` where `last_refreshed_at < now() - refresh_interval_days`
- Re-run analysis for stale briefs
- Update stars count from GitHub API
- Default refresh: every 30 days for most repos, 7 days for fast-moving ones

#### 2.4 Cost Estimation

Using the existing analysis pipeline:
- GitHub API: ~50-100 calls per repo (well within 5,000/hr with server token)
- LLM (agentic analysis): ~$0.15-0.50 per repo via OpenRouter
- **Initial indexing of 100 repos**: ~$15-50 in LLM costs
- **Monthly refresh of 100 repos**: ~$15-50/month

This is dramatically cheaper than DeepWiki's $300K because:
1. We're indexing 100 repos, not 50,000
2. We generate structured briefs, not full per-file documentation
3. We use cost-efficient models (Haiku for exploration, Sonnet for synthesis)

### Phase 3: Frontend — Discovery Experience

#### 3.1 New Landing Page (`/` or `/explore`)

Transform the homepage from a form into a discovery grid:

```
┌──────────────────────────────────────────────────────────────┐
│  RepoRecall                          [Search]  [Sign In]     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Understand any codebase in minutes                          │
│                                                              │
│  [══════ Search repos or paste a GitHub URL ══════] [Recall] │
│                                                              │
│  ── Featured Repos ─────────────────────────────────────     │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│  │ react        │ │ next.js      │ │ langchain    │         │
│  │ facebook     │ │ vercel       │ │ langchain-ai │         │
│  │ ★ 230k  JS  │ │ ★ 130k  TS  │ │ ★ 100k  Py  │         │
│  │ A library    │ │ The React    │ │ Build AI     │         │
│  │ for building │ │ framework    │ │ apps with    │         │
│  │ user inter.. │ │ for the web  │ │ LLMs         │         │
│  └──────────────┘ └──────────────┘ └──────────────┘         │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│  │ supabase     │ │ transformers │ │ bun          │         │
│  │ ...          │ │ ...          │ │ ...          │         │
│  └──────────────┘ └──────────────┘ └──────────────┘         │
│                                                              │
│  [All Categories ▾]  [Frontend] [Backend] [AI] [DevTools]   │
│                                                              │
│  ── Your Repos ───── (sign in to see) ──────────────────     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### 3.2 Public Brief View (`/explore/[owner]/[repo]`)

Reuse the existing `BriefPage` component but with:
- **Read-only mode**: No re-analyze, no export, no chat (or limited chat)
- **CTA banner**: "Sign in to analyze your own repos, chat with this codebase, and more"
- **No sidebar** showing user's other briefs — replace with related public repos
- Same section navigation: Overview, Codemap, Architecture, Features, etc.

#### 3.3 Search

```
GET /api/explore?q=react+framework&language=typescript&limit=20
```

Uses Postgres full-text search on the `search_vector` column. Fast, no external dependency.

#### 3.4 Category Filtering

Derive categories from `topics` and `language` fields. Show filter tabs:
- All | Frontend | Backend | AI/ML | DevTools | Infrastructure | Databases

### Phase 4: Conversion Funnel (Anonymous → Signed In)

The pre-indexed library is a **top-of-funnel acquisition channel**:

1. **Discovery**: User finds a public brief via search, social sharing, or browsing
2. **Value demonstration**: They see exactly what RepoRecall produces — the brief format, the architecture diagrams, the business context
3. **Upgrade trigger**: When they want to:
   - Analyze their own (private) repo
   - Chat with a codebase
   - Save briefs to their account
   - Get deeper analysis (Pro features)
4. **Sign-in CTA**: Contextual prompts at each friction point

This mirrors DeepWiki's model: free access to public repo wikis drives awareness, then users upgrade for private repos and advanced features.

---

## URL Strategy

### Option A: Subdirectory (Recommended for MVP)
```
/explore                           → Browse all public briefs
/explore/facebook/react            → Public brief for React
/explore?q=state+management        → Search
```

### Option B: Subdomain (Future)
```
explore.reporecall.com/facebook/react
```

### Option C: DeepWiki-style URL replacement
```
reporecall.com/facebook/react      → Auto-detect and serve public brief
```

**Recommendation: Start with Option A.** Clean separation, no DNS/hosting complexity, easy to implement with Next.js dynamic routes.

---

## Key Technical Decisions

### 1. Separate table vs. flag
**Decision: Separate `public_briefs` table.** Avoids RLS complexity, prevents accidental data leakage, allows different schema evolution (public briefs need `stars`, `topics`, `is_featured`; user briefs don't).

### 2. When to index
**Decision: Admin-triggered initially, cron-based refresh later.** Start with a script that indexes a curated list. Add a Vercel cron (`/api/cron/refresh-public-briefs`) once the list stabilizes.

### 3. Chat for anonymous users
**Decision: No chat initially.** Chat requires LLM calls per message — offering it freely to anonymous users would be expensive and hard to rate-limit. Make it a sign-in incentive. Revisit when there's a clear cost model.

### 4. Server-side GitHub token
**Decision: Use a dedicated GitHub App or PAT with higher rate limits.** The server `GITHUB_TOKEN` env var already exists. For indexing at scale (100+ repos), consider a GitHub App installation token which gets 5,000 req/hr without user OAuth.

### 5. Static generation vs. dynamic
**Decision: ISR (Incremental Static Regeneration) for public briefs.** These briefs change infrequently (monthly refresh). Serve them as statically generated pages with ISR revalidation, reducing server load and improving TTFB dramatically.

```typescript
// src/app/explore/[owner]/[repo]/page.tsx
export const revalidate = 86400; // Revalidate daily

export async function generateStaticParams() {
  // Pre-generate pages for featured repos at build time
  const { briefs } = await getAllPublicBriefs({ featured: true });
  return briefs.map(b => ({
    owner: b.repoInfo.owner,
    repo: b.repoInfo.name,
  }));
}
```

---

## Implementation Phases & Effort Estimate

### Phase 1: Foundation (Database + API) — ~2-3 days
- [ ] Migration: `public_briefs` table with search + indexes
- [ ] Store functions for public brief CRUD
- [ ] API routes: `GET /api/explore`, `GET /api/explore/[owner]/[repo]`
- [ ] Middleware updates to allow unauthenticated access to `/explore` routes
- [ ] Admin endpoint to trigger indexing

### Phase 2: Indexing Pipeline — ~1-2 days
- [ ] Script to index a curated list of repos using existing analysis pipeline
- [ ] Seed the initial 50-100 repos
- [ ] Cron endpoint for periodic refresh

### Phase 3: Frontend — ~2-3 days
- [ ] Explore page with repo grid, search, and category filters
- [ ] Public brief view (read-only variant of BriefPage)
- [ ] Homepage redesign with featured repos
- [ ] Sign-in CTAs at conversion points

### Phase 4: Polish — ~1-2 days
- [ ] ISR / static generation for public briefs
- [ ] Rate limiting for anonymous API access
- [ ] SEO: meta tags, Open Graph, structured data for repo pages
- [ ] Social sharing: "View [repo] on RepoRecall" links

**Total: ~6-10 days of focused work.**

---

## SEO & Growth Implications

Pre-indexed public briefs create a massive SEO opportunity:

- **100+ indexed pages** for high-traffic repo names ("react architecture", "next.js overview")
- **Social sharing**: Developers share brief links on Twitter/X, Reddit, HN
- **Backlink potential**: Blog posts referencing RepoRecall's analysis of popular repos
- **Long-tail search**: "how does [repo] work", "[repo] architecture", "[repo] tech stack"

This is the same playbook DeepWiki used to grow rapidly — every public repo page is a potential search result and sharing surface.

---

## Open Questions

1. **How many repos to start with?** Recommendation: 50-100 curated, high-star repos. Quality over quantity for launch.
2. **User-requested public indexing?** Should anonymous users be able to request indexing of any public repo (with queue/rate limits)? DeepWiki does this — worth adding in Phase 2.
3. **Chat for public briefs?** Start without it. Could add rate-limited chat (3 messages/day for anonymous) as a hook.
4. **Repo suggestion/voting?** Let users vote on which repos to index next — creates engagement and signals demand.
5. **API access?** DeepWiki offers an MCP server. RepoRecall could offer a public API for structured repo briefs — potential developer tool integration.
