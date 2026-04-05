# Founder-Style Product Requirements Document

## Project Brief (RepoRecall)

A codebase continuity product for solo developers and indie founders to quickly re-familiarize themselves with dormant or fast-moving projects.

| | |
|---|---|
| **Prepared for** | Founder exploration |
| **Document type** | Startup-style PRD / MVP framing |
| **Core thesis** | Help a solo builder understand what a codebase does, how it works, what changed, and what business context is encoded in it. |

> **Why now:** AI makes it easier to create software faster than a solo builder can remember it. Returning to an old project now means recovering both the technical system and the product logic behind it.

---

## 1. Problem

Solo builders create software quickly, often across several side projects or client apps, then lose context when they step away. When they return, the pain is not just code recall. They also forget the product logic, unfinished bets, and reasons behind prior changes.

- Existing tools are optimized for code review, team onboarding, or repo chat, not personal re-entry.
- The default workaround is an ad hoc mix of README files, commit history, and AI chat inside the editor.
- As AI-generated code increases, the amount of software a solo developer can create now exceeds what they can easily remember later.

## 2. Product thesis

Project Brief is a codebase continuity product for solo developers. It helps a builder return to an old project and recover their mental model quickly by generating a structured briefing on what the project does, how it works, what changed, and what business context is embedded in it.

### One-line positioning

The fastest way to get back into your own code.

### Category framing

Not an AI code reviewer. Not a team knowledge base. Not a generic repo wiki. It is a project briefing and re-familiarization product.

## 3. Target user and job to be done

### Primary user

Solo developers, indie hackers, and solopreneurs building fast-moving web and AI apps.

### Core job

Help me understand what this project is, how it is built, what changed, and where to start so I can resume work confidently.

### Emotional job

Reduce the friction, guilt, and overwhelm that come from reopening a repo and feeling like a stranger in your own codebase.

## 4. Why this wins

Most adjacent tools explain the repository. Project Brief should explain the repository relative to the builder: what matters most, what evolved, and what the code is trying to accomplish as a product.

- Personal re-entry is the primary workflow, not a side effect.
- Technical understanding and business context are merged into one brief.
- The product should tell the story of the codebase over time, not just summarize files.
- The end state is confidence: the user knows where to jump in next.

## MVP scope

The first release should feel like a project briefing product, not a generic repo chatbot. The MVP can be intentionally narrow as long as it produces a credible, useful brief from a GitHub repo and PR history.

| Area | Include in MVP | Why it matters |
|------|---------------|----------------|
| Repo ingestion | Parse repo tree, manifests, README, configs, routes, schemas, PR metadata, commit summaries | Provides enough structure to infer the product, the stack, and the main moving parts. |
| Project brief | Generate one briefing with overview, core features, stack, APIs, dependencies, key modules, and where to start | Delivers the core re-entry value immediately. |
| Change timeline | Summarize PRs into milestones and feature-level themes | Explains what changed and gives the project a narrative arc. |
| Business context | Infer target user, value proposition, business model clues, and feature intent | Makes the output useful to founders, not just developers. |
| Guided entrypoints | Recommend the first files, services, and flows to inspect | Turns understanding into action. |
| Out of scope | IDE plugin, autonomous coding, live code review, team collaboration suite | Keeps the first product opinionated and focused. |

## 5. Core user experience

### Primary flow

1) Connect a repo. 2) Analyze the codebase and PR history. 3) Generate a Project Brief. 4) Land on an overview page that answers what the project does, how it is built, and how it evolved. 5) Drill into features, technical architecture, APIs, dependencies, and change history. 6) End with recommended starting points.

### Hero moment

A user opens a neglected repo and instantly says: yes, that is what this app does; yes, that is how I built it; yes, now I know where to start.

## 6. Product output

The core artifact is a generated Project Brief. It should be concise enough to skim in minutes but rich enough to restore the builder's mental model.

- What this project is: product summary, likely user, value proposition, major flows.
- How it is built: stack, dependencies, APIs, integrations, architecture summary, key modules.
- Core features: product-facing capabilities, mapped to code areas and explained in plain language.
- Business context: what each feature appears to support, such as activation, monetization, retention, admin, or experimentation.
- Evolution timeline: major PR-driven milestones, grouped changes, and likely rationale.
- Where to start: recommended files, services, and entrypoints for the next session.

## 7. Business context layer

This is the differentiator that lifts the product above technical repo summarization. The goal is to help a returning founder understand the startup logic encoded in the software, not just the software itself.

- Infer the likely target user, business model clues, and value proposition from code, docs, PRs, and naming.
- Classify features by business purpose: acquisition, activation, retention, revenue, admin, or infrastructure.
- Explain why a feature likely exists, not just how it is implemented.
- Distinguish observed facts from inferred interpretation to preserve trust.

## 8. Competitive framing

The product does not need to win at generic repo chat or AI review. It needs to own the return-to-context use case.

- Direct substitutes: Cursor, GitHub Copilot, Windsurf, and repo-chat workflows already inside the editor.
- Closest adjacency: DeepWiki or Code Wiki style repo understanding products that generate overviews and documentation.
- Indirect competitors: Unblocked, Swimm, and CodeSee, which are more team-oriented and onboarding-shaped.
- Less relevant: review-first products like CodeRabbit and Greptile unless the roadmap shifts toward PR review.

The clearest differentiation is that Project Brief is designed for a solo builder returning to their own project after time away.

## 9. Risks and product decisions

- Inference quality risk: business context may be partially wrong. Mitigation: show evidence, confidence, and separate observed from inferred outputs.
- Commoditization risk: users may think this is just another repo chatbot. Mitigation: lead with re-entry briefs and timeline-driven understanding.
- Sparse data risk: some solo builders do not write good PRs. Mitigation: fall back to commits, README, file structure, config, and feature grouping from code.
- Willingness-to-pay risk: solo devs are price sensitive. Mitigation: target strong pain, keep setup fast, and price around portfolio continuity rather than enterprise collaboration.

## Launch framing and GTM

The go-to-market should match the product: low-friction, opinionated, and solo-dev native. It should not pretend to be an enterprise platform.

| Topic | Recommendation |
|-------|---------------|
| ICP | Solo developers, indie hackers, and solopreneurs who juggle several apps and often revisit older repos after days or weeks away. |
| Promise | Open any project and get a briefing on what it does, how it works, what changed, and why it matters. |
| Entry wedge | Private GitHub repos for web and AI apps, where rapid iteration and context loss are common. |
| Acquisition | Founder Twitter/X, indie hacker communities, launch videos showing a neglected repo turned into a clean project brief in minutes. |
| Pricing hypothesis | Free for one repo or shallow history. Paid solo plan for multiple private repos, deeper history, and richer business-context analysis. |
| Retention hook | A builder returns because every paused project becomes easier to resume and every new PR improves the future brief. |

## 10. Success metrics and next steps

### Metrics to watch

- Time to first useful briefing.
- User-rated usefulness of the overview, feature map, and change timeline.
- Number of repos connected per user.
- Repeat revisits to paused projects.
- Self-reported reduction in time required to re-familiarize.

### Recommended first build

Ship a narrow version that ingests GitHub repos and PR history, then produces one genuinely good Project Brief. If the brief feels crisp and trustworthy, the rest of the product can expand from there.

---

## 11. Current codebase state (as of April 2026)

The MVP has been built and is functional. Below is the implementation status mapped against the PRD requirements.

### Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2.2 (React 19) |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| GitHub API | @octokit/rest v22 |
| Chat/LLM | OpenRouter API (Claude Sonnet 4) |
| Diagrams | Mermaid |
| Syntax highlighting | Shiki |

### MVP feature status

| PRD requirement | Status | Implementation |
|----------------|--------|---------------|
| Repo ingestion | **Done** | `src/lib/github.ts` - Parses repo tree, manifests, README, configs, PR metadata, commit summaries via GitHub API |
| Project brief generation | **Done** | `src/lib/analysis.ts` - Generates structured briefs with overview, features, stack, APIs, dependencies, key modules |
| Change timeline | **Done** | `src/lib/analysis.ts` - Groups merged PRs into monthly milestones with themes |
| Business context | **Done** | `src/lib/analysis.ts` - Infers target user, value prop, business model; classifies features by AARRR categories |
| Guided entrypoints | **Done** | `src/lib/analysis.ts` - Recommends starting files/flows with priority levels |
| Chat with codebase | **Done** | `src/app/api/chat/route.ts` - Streaming AI responses grounded in brief context via OpenRouter |
| Codemap/architecture viz | **Done** | Mermaid-based architecture diagrams |
| Syntax highlighting | **Done** | Shiki-powered code references with line-specific linking |
| Dashboard | **Done** | `src/app/dashboard/page.tsx` - Lists all generated briefs |
| Brief detail view | **Done** | `src/app/brief/[id]/page.tsx` - Full brief with all sections + chat panel |

### API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/analyze` | POST | Analyze a GitHub repo, return a ProjectBrief |
| `/api/briefs` | GET | List all stored briefs |
| `/api/briefs/[id]` | GET | Retrieve a specific brief |
| `/api/briefs/[id]` | DELETE | Delete a brief and its chat history |
| `/api/chat` | POST | Stream AI chat responses about a codebase |

### What is NOT built yet

| Capability | Current state | Impact |
|-----------|--------------|--------|
| **Persistent storage** | In-memory `Map` objects (`src/lib/store.ts`) - all data lost on server restart | Cannot deploy to production; no data durability |
| **Authentication** | None - no user accounts, no login, no sessions | No user isolation; anyone can see/delete any brief |
| **Payments** | None - no billing, no usage tracking, no Stripe | No monetization path; cannot enforce free tier limits |
| **Rate limiting** | None - no per-user quotas | GitHub API and LLM costs are uncontrolled |
| **Private repo support** | Partial - requires manually setting GITHUB_TOKEN env var | Users cannot connect their own GitHub accounts |

### Environment variables

```
GITHUB_TOKEN=         # Optional - for private repos and higher rate limits (5,000 vs 60 req/hr)
OPENROUTER_API_KEY=   # Required - powers the chat feature
```

---

## 12. Implementation plan: storage, auth, and payments

### Phase 1: Database and persistence (Supabase)

Replace the in-memory store with Supabase (hosted PostgreSQL + built-in auth + row-level security).

**Why Supabase:** Gets database + auth + RLS in one integration. First-class Next.js support. Generous free tier for MVP validation. Avoids stitching together separate DB and auth providers.

#### Schema design

```sql
-- Users table (managed by Supabase Auth, extended with profile)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  display_name text,
  avatar_url text,
  github_username text,
  github_access_token text,  -- encrypted, for private repo access
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Briefs table (replaces in-memory briefs Map)
create table public.briefs (
  id text primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  repo_full_name text not null,
  repo_info jsonb not null,
  overview jsonb not null,
  architecture jsonb not null,
  features jsonb not null,
  business_context jsonb not null,
  timeline jsonb not null,
  entrypoints jsonb not null,
  generated_at timestamptz not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Chat messages table (replaces in-memory chatHistory Map)
create table public.chat_messages (
  id text primary key,
  brief_id text references public.briefs(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  timestamp timestamptz not null,
  created_at timestamptz default now()
);

-- Usage tracking (for billing and rate limiting)
create table public.usage (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  action text not null,  -- 'analyze', 'chat_message'
  repo_full_name text,
  tokens_used integer default 0,
  created_at timestamptz default now()
);

-- Row-level security policies
alter table public.briefs enable row level security;
alter table public.chat_messages enable row level security;
alter table public.usage enable row level security;

create policy "Users can only access their own briefs"
  on public.briefs for all using (auth.uid() = user_id);

create policy "Users can only access their own chat messages"
  on public.chat_messages for all using (auth.uid() = user_id);

create policy "Users can only access their own usage"
  on public.usage for all using (auth.uid() = user_id);
```

#### Migration path for `src/lib/store.ts`

The current store interface (`saveBrief`, `getBrief`, `getAllBriefs`, `deleteBrief`, `getChatMessages`, `addChatMessage`, `clearChatMessages`) maps directly to Supabase queries. Replace the `Map` implementations with Supabase client calls while keeping the same function signatures, so no API route changes are needed.

### Phase 2: Authentication (Supabase Auth + GitHub OAuth)

**Why GitHub OAuth:** Users are already providing GitHub repo URLs. GitHub OAuth is the natural identity provider - it also grants access to private repos without a separate token flow.

#### Auth flow

1. User clicks "Sign in with GitHub" on the landing page
2. Supabase Auth handles the OAuth flow, requests `repo` scope for private repo access
3. On callback, store the GitHub access token in the `profiles` table (encrypted)
4. All subsequent GitHub API calls use the user's own token instead of the server-side `GITHUB_TOKEN`
5. Supabase session cookie handles auth state; Next.js middleware protects `/dashboard` and `/api/*` routes

#### Route protection

| Route | Access |
|-------|--------|
| `/` (landing) | Public |
| `/api/analyze` | Authenticated |
| `/api/briefs` | Authenticated (filtered by user_id via RLS) |
| `/api/briefs/[id]` | Authenticated (RLS ensures ownership) |
| `/api/chat` | Authenticated |
| `/dashboard` | Authenticated |
| `/brief/[id]` | Authenticated (RLS ensures ownership) |

#### Dependencies to add

```
@supabase/supabase-js
@supabase/ssr          # Next.js server-side auth helpers
```

### Phase 3: Payments (Stripe)

**Why Stripe:** Industry standard. Supports both subscription and usage-based billing. Excellent webhook support for real-time plan enforcement.

#### Pricing model (per PRD: "Free for one repo or shallow history. Paid solo plan for multiple private repos, deeper history, and richer business-context analysis.")

| | Free | Pro ($9/mo) |
|---|------|-------------|
| Public repos | 3 briefs | Unlimited |
| Private repos | 0 | Unlimited |
| Chat messages | 20/month | Unlimited |
| PR history depth | Last 30 PRs | Full history |
| Business context | Basic | Full AARRR analysis |
| Brief refresh | Manual only | Auto-refresh on new PRs |

#### Implementation

1. **Stripe Checkout:** Create a checkout session from a "Upgrade to Pro" button on the dashboard
2. **Stripe Webhooks:** Listen for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` events at `/api/webhooks/stripe`
3. **Plan enforcement:** Add `subscription_status` and `stripe_customer_id` columns to `profiles` table. Check plan limits in API route middleware before allowing `analyze` or `chat` actions
4. **Usage metering:** The `usage` table tracks actions per user. Middleware checks counts against plan limits before processing requests

#### Schema additions for billing

```sql
alter table public.profiles add column stripe_customer_id text;
alter table public.profiles add column subscription_status text default 'free'
  check (subscription_status in ('free', 'pro', 'cancelled'));
alter table public.profiles add column subscription_period_end timestamptz;
```

#### Dependencies to add

```
stripe                 # Stripe Node.js SDK
```

### Phase 4: Rate limiting and usage controls

| Resource | Free limit | Pro limit | Implementation |
|----------|-----------|-----------|----------------|
| Analyses per month | 3 | Unlimited | Count rows in `usage` where action = 'analyze' in current billing period |
| Chat messages per month | 20 | Unlimited | Count rows in `usage` where action = 'chat_message' in current billing period |
| GitHub API calls | Shared server token (60/hr) | User's own token (5,000/hr) | Auth token from `profiles.github_access_token` |

### Implementation order

```
Phase 1: Supabase setup + database migration     (~2-3 days)
  - Create Supabase project
  - Run schema migrations
  - Replace src/lib/store.ts with Supabase client
  - Verify all existing features work with persistent storage

Phase 2: Authentication                           (~2-3 days)
  - Add Supabase Auth with GitHub OAuth
  - Add Next.js middleware for route protection
  - Update API routes to use authenticated user context
  - Store GitHub tokens for private repo access
  - Add sign-in/sign-out UI

Phase 3: Payments                                 (~2-3 days)
  - Set up Stripe products and pricing
  - Add checkout flow and billing portal link
  - Implement webhook handler
  - Add plan enforcement middleware
  - Add usage tracking to analyze and chat routes

Phase 4: Polish and deploy                        (~1-2 days)
  - Rate limiting middleware
  - Error handling for quota exceeded
  - Upgrade prompts in UI
  - Deploy to Vercel + Supabase
```

### New environment variables required

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRO_PRICE_ID=

# Existing
OPENROUTER_API_KEY=
# GITHUB_TOKEN no longer needed (users provide their own via OAuth)
```
