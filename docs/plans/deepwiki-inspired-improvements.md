# DeepWiki-Inspired Improvements Plan

> Implement key improvements inspired by [deepwiki-open](https://github.com/AsyncFuncAI/deepwiki-open) to enhance RepoRecall's analysis depth, coverage, and output quality.

**Status:** In progress — Phases 1–3 shipped, Phase 6 (pgvector persistence) in flight
**Created:** 2026-04-12
**Last updated:** 2026-04-13
**Source:** Comparative analysis of DeepWiki-Open vs RepoRecall repo processing pipelines

## Shipped

| Phase | Landed in | Notes |
|-------|-----------|-------|
| 1. Semantic search as agent tool | #17 `c655b3d` | In-memory `EmbeddingStore` with code-aware chunking at `src/lib/agent/vectorSearch.ts`; auto-index on readFile; seed before exploration |
| 2. Mermaid diagram generation | #18 `ac11f15` + `93a6b1b` | Added `dataFlow` + `entityRelationship` diagrams to synthesis; validation + rendering in place |
| 3. Deep Research mode | #20 `8b60b5b` + `25aad37` | Two-cycle explore → gap-analyze → explore → synthesize; gated behind Pro; fits under the 300s Vercel route budget |

## Deferred / reprioritized

- **Phase 4 (Multi-platform):** deferred — GitHub remains sole supported platform until demand justifies the refactor.
- **Phase 5 (Local clone):** deferred — incompatible with Vercel serverless; would require separate worker infra. Revisit only if API budget becomes the bottleneck.
- **Phase 6 (pgvector persistence) — added post-plan:** extends Phase 1 so embeddings survive across analyses of the same (repo, commit). See below.

---

## Table of Contents

1. [Background & Motivation](#background--motivation)
2. [Improvement Overview](#improvement-overview)
3. Phase 1: Semantic Search as an Agent Tool — shipped
4. Phase 2: Mermaid Diagram Generation in Synthesis — shipped
5. Phase 3: Deep Research Mode — shipped
6. Phase 4: Multi-Platform Support — deferred
7. Phase 5: Local Clone Option for Heavy Analysis — deferred
8. Phase 6: Persist Embeddings in pgvector — in progress
9. [File Map](#file-map)
10. [Testing Strategy](#testing-strategy)
11. [Risks & Mitigations](#risks--mitigations)

---

## Background & Motivation

### How DeepWiki-Open Processes Repos (for context)

DeepWiki-Open uses a **classic RAG pipeline**:
1. **Full git clone** of the repo to local filesystem
2. **Word-based chunking** of all files (350 words/chunk, 100 word overlap)
3. **Embedding generation** via OpenAI `text-embedding-3-small` (256 dims) or Google/Ollama alternatives
4. **FAISS vector index** for semantic similarity search (top-k=20)
5. **Wiki structure determination** — LLM analyzes file tree + README, outputs XML wiki structure
6. **Per-page RAG generation** — for each wiki page, retrieve relevant chunks from FAISS, LLM generates Markdown with Mermaid diagrams
7. **Cache** to local filesystem (`~/.adalflow/`)

### How RepoRecall Processes Repos (current)

RepoRecall uses an **agentic exploration pipeline**:
1. **GitHub API only** (no clone) — fetches metadata, file tree, PRs, commits via Octokit
2. **Agentic exploration loop** — LLM iteratively calls tools (readFile, searchCode, listDirectory, readFileLines) for up to 35 iterations / 120 API calls
3. **LLM synthesis** — exploration findings fed to synthesis LLM, outputs structured ProjectBrief JSON
4. **Supabase persistence** — briefs stored as JSON in PostgreSQL

### Key Gaps

| Gap | Impact |
|-----|--------|
| No semantic/vector search — agent relies on keyword search + manual file discovery | Agent misses relevant code it doesn't know to look for |
| No multi-platform support — GitHub only | Limits addressable market |
| Single-pass analysis — one explore-synthesize cycle | Complex repos get shallow coverage |
| Diagrams already exist but could be richer with dedicated generation | Visual understanding could be stronger |

---

## Improvement Overview

| # | Improvement | Effort | Impact | Priority |
|---|------------|--------|--------|----------|
| 1 | Semantic search as agent tool | Medium | Very High | P0 |
| 2 | Mermaid diagram generation in synthesis | Low | High | P0 |
| 3 | Deep Research mode (multi-pass analysis) | Medium | High | P1 |
| 4 | Multi-platform support (GitLab, Bitbucket) | Medium | Medium | P2 |
| 5 | Local clone option for heavy analysis | High | Medium | P3 |

---

## Phase 1: Semantic Search as an Agent Tool — ✅ Shipped (#17)

### Goal

Give the agentic exploration loop a `searchSemantic` tool that finds code by *meaning*, not just keywords. This is the single highest-impact improvement — it makes every iteration of the exploration loop more effective.

### How DeepWiki Does It

DeepWiki embeds the *entire* repo upfront (all code + docs), stores in FAISS, and retrieves top-20 chunks per query. This is effective but wasteful — most chunks are never queried. It also uses naive word-based chunking that splits mid-function.

### Our Approach (Hybrid)

Rather than embedding everything upfront like DeepWiki, we should:

1. **On-demand embedding during exploration** — as the agent reads files via `readFile`, embed and index those files in a temporary in-memory vector store
2. **Bulk-embed high-signal files at start** — before the exploration loop begins, identify and embed key files (README, main entry points, config files, route handlers) based on the file tree
3. **Expose `searchSemantic(query)` as a tool** — the agent can use it alongside `searchCode` to find related code by meaning

This gives us the benefits of semantic search without the cost of embedding an entire repo.

### Implementation

#### 1.1 Add embedding dependency

**File:** `package.json`

Add an embedding library. Options:
- **Option A (recommended):** Use OpenAI's embedding API directly via `openai` package (already likely accessible through OpenRouter, or add `openai` as a direct dependency)
- **Option B:** Use a lightweight client-side embedding model like `@xenova/transformers` for zero-cost local embeddings (larger bundle, but no API costs)

Decision: Start with Option A (OpenAI API) for quality, consider Option B later for cost optimization.

#### 1.2 Create embedding + vector search module

**New file:** `src/lib/agent/vectorSearch.ts`

```
Interface:
- EmbeddingStore class
  - constructor(model?: string) — defaults to "text-embedding-3-small"
  - async addDocuments(docs: { path: string, content: string, startLine?: number }[]) — chunk, embed, store
  - async search(query: string, topK?: number) — returns ranked results with path, content snippet, score
  - clear() — reset the store

Chunking strategy (code-aware, NOT naive word-based like DeepWiki):
  - Split by function/class boundaries where possible (regex-based: look for function/class/export declarations)
  - Fallback to ~300-token chunks with 50-token overlap
  - Preserve file path + line number metadata per chunk

Vector store:
  - Use a simple in-memory cosine similarity search (no FAISS dependency needed)
  - For MVP, a flat array of {embedding: number[], metadata: {...}} with brute-force search is fine
  - Can upgrade to hnswlib-node or similar if performance becomes an issue
```

#### 1.3 Integrate into tool executor

**File:** `src/lib/agent/executor.ts`

Add a new tool definition alongside existing tools:

```
New tool: searchSemantic
  - Parameters: { query: string, topK?: number (default 10) }
  - Behavior:
    1. Call embeddingStore.search(query, topK)
    2. Return results formatted as: path, line range, relevance score, content snippet
  - Does NOT count against the 120 GitHub API call budget (it's local)
```

Also modify the existing `readFile` tool to **auto-index files as they're read**:
- After fetching file content, call `embeddingStore.addDocuments(...)` in the background
- This means the semantic index grows as the agent explores — later searches benefit from earlier reads

#### 1.4 Seed the index before exploration

**File:** `src/lib/agent/orchestrator.ts`

Before starting the exploration loop (around line 56), add a seeding step:

```
1. Identify high-signal files from the file tree:
   - README.md, package.json/requirements.txt/go.mod/Cargo.toml
   - Main entry points (src/index.ts, src/main.ts, src/app.ts, main.py, cmd/main.go, etc.)
   - Config files (next.config.js, tsconfig.json, etc.)
   - Route/page files (up to 10, prioritized by path depth)
2. Fetch content for these files (batch, ~10-15 files)
3. Embed and add to the EmbeddingStore
4. Pass the EmbeddingStore instance to the ToolExecutor
```

This costs ~10-15 API calls from the budget but provides immediate semantic search capability.

#### 1.5 Update exploration prompt

**File:** `src/lib/agent/prompts.ts`

Add `searchSemantic` to the tool descriptions in the exploration prompt. Guide the LLM to use it:

```
Add to the exploration strategy:
- "Use searchSemantic to find code related to concepts you've identified (e.g., 'authentication middleware', 'database connection pooling', 'payment processing')"
- "Prefer searchSemantic over searchCode when looking for conceptual relationships rather than exact string matches"
```

#### 1.6 Cleanup

The EmbeddingStore is in-memory and per-analysis — no persistence needed. It gets garbage collected when the analysis completes.

### Acceptance Criteria

- [ ] `searchSemantic` tool is available to the exploration LLM
- [ ] Files read during exploration are automatically indexed
- [ ] High-signal files are pre-indexed before exploration starts
- [ ] Semantic search results include file path, line range, and content snippet
- [ ] Agent uses `searchSemantic` in at least some exploration iterations (verify via logs)
- [ ] No regression in analysis quality for existing test repos
- [ ] Embedding API calls do not count against the 120 GitHub API call budget

---

## Phase 2: Mermaid Diagram Generation in Synthesis — ✅ Shipped (#18)

### Goal

Improve the quality and variety of Mermaid diagrams in the brief output. The current system already generates diagrams (`orchestrator.ts:475-510` validates them), but DeepWiki produces richer diagrams by explicitly instructing the LLM to create them with Mermaid syntax for each wiki page.

### How DeepWiki Does It

DeepWiki's wiki page generation prompt includes:
- Explicit instruction to use Mermaid for architecture diagrams, sequence diagrams, class diagrams, and flowcharts
- Each page can have multiple diagram types
- Diagrams are generated inline with the wiki content

### Our Approach

We already have diagram generation in the synthesis prompt (`prompts.ts`) and validation (`orchestrator.ts:475-510`). The improvements are:

#### 2.1 Expand diagram types in synthesis prompt

**File:** `src/lib/agent/prompts.ts`

Currently the synthesis prompt requests three diagrams:
- `overview` — sequenceDiagram (request lifecycle)
- `architecture` — graph TD (system architecture)
- `stack` — graph TD (tech stack layers)

Add two more diagram types to the synthesis JSON schema:

```
"diagrams": {
  "overview": "sequenceDiagram ...",      // existing — request lifecycle
  "architecture": "graph TD ...",          // existing — system components
  "stack": "graph TD ...",                 // existing — tech stack layers
  "dataFlow": "flowchart LR ...",          // NEW — data flow through the system
  "entityRelationship": "erDiagram ..."    // NEW — key data models and relationships
}
```

Update the prompt guidance for each:
- `dataFlow`: "Show how data moves through the system — from user input through API routes, services, and database. Use flowchart LR syntax."
- `entityRelationship`: "Show the key data models/entities and their relationships. Use erDiagram syntax. Only include if the repo has clear data models (database schemas, ORM models, type definitions)."

#### 2.2 Add diagram validation for new types

**File:** `src/lib/agent/orchestrator.ts`

Extend the diagram validation logic (around lines 475-510) to handle:
- `dataFlow`: validate as `flowchart` (LR/TD/TB)
- `entityRelationship`: validate as `erDiagram`

#### 2.3 Add diagram rendering in brief UI

**File:** `src/components/sections/OverviewSection.tsx` (and potentially `ArchitectureSection.tsx`)

Add rendering for the two new diagram types:
- `dataFlow` diagram in the Architecture section
- `entityRelationship` diagram near the data models / codemap section

Use the same Mermaid rendering approach already in place for existing diagrams.

#### 2.4 Improve diagram prompt quality

In the synthesis prompt, add explicit guidance to prevent common Mermaid issues:
- "Do NOT use special characters in node labels — wrap labels in quotes if they contain parentheses, brackets, or other special chars"
- "Keep diagrams focused — max 15 nodes for architecture, max 10 entities for ER diagrams"
- "Use descriptive edge labels to show relationships"

### Acceptance Criteria

- [ ] Synthesis produces up to 5 diagram types (overview, architecture, stack, dataFlow, entityRelationship)
- [ ] New diagram types are validated before inclusion in the brief
- [ ] New diagrams render correctly in the UI
- [ ] ER diagram is only generated when the repo has clear data models (graceful omission)
- [ ] No increase in synthesis failures due to malformed diagrams

---

## Phase 3: Deep Research Mode — ✅ Shipped (#20)

### Goal

Add a multi-pass analysis mode for complex repos. Instead of one explore-synthesize cycle, the agent does multiple cycles where each cycle's findings inform the next cycle's questions — producing dramatically richer briefs.

### How DeepWiki Does It

DeepWiki's "Deep Research" mode runs up to 5 LLM iterations:
- Iteration 1: Research Plan
- Iterations 2-4: Research Updates (building on prior findings)
- Iteration 5: Final Conclusion synthesis

Each iteration has a specialized prompt and builds on the accumulated findings.

### Our Approach

We already have the agentic infrastructure — this is about adding a second (and optionally third) exploration cycle that targets gaps identified in the first pass.

#### 3.1 Add analysis depth option

**File:** `src/app/api/analyze/route.ts`

Accept a new parameter in the analyze request:

```
body: {
  repoUrl: string,
  depth?: "standard" | "deep"  // default: "standard"
}
```

- `standard`: Current behavior (1 exploration cycle, 35 iterations, 120 API calls)
- `deep`: 2-3 exploration cycles with gap analysis between them

Gate `deep` behind Pro plan (or a usage multiplier — deep costs ~2-3x a standard analysis).

#### 3.2 Implement multi-cycle orchestration

**File:** `src/lib/agent/orchestrator.ts`

Add a new function `runDeepAnalysis()` that wraps the existing flow:

```
Cycle 1: Standard Exploration (existing flow)
  - 35 iterations, 120 API calls
  - Produces initial ProjectBrief

Gap Analysis (new):
  - Feed the initial brief back to the LLM with a gap-analysis prompt:
    "Given this analysis of {repo}, identify the top 5 areas that need deeper investigation.
     For each area, specify:
     - What's missing or unclear
     - Which files or directories to investigate
     - What questions to answer"
  - Parse the response into a list of investigation targets

Cycle 2: Targeted Deep Dive (new):
  - New exploration loop with a focused prompt:
    "You previously analyzed this repo and identified these gaps: {gaps}.
     Your previous findings: {summary of cycle 1 findings}.
     Now investigate these specific areas. Focus on: {gap targets}"
  - 20 iterations, 80 API calls (smaller budget, more focused)
  - EmbeddingStore carries over from cycle 1 (if Phase 1 is implemented)

Final Synthesis:
  - Combine findings from both cycles
  - Run synthesis with richer context
  - Produces enhanced ProjectBrief
```

#### 3.3 Add progress events for deep mode

**File:** `src/lib/agent/orchestrator.ts`

Emit progress events so the UI can show which cycle is active:

```
{ phase: "exploration", cycle: 1, iteration: 15, totalCycles: 2 }
{ phase: "gap-analysis", cycle: 1 }
{ phase: "exploration", cycle: 2, iteration: 8, totalCycles: 2 }
{ phase: "synthesis" }
```

#### 3.4 Add gap analysis prompt

**New addition to:** `src/lib/agent/prompts.ts`

```
GAP_ANALYSIS_PROMPT:
  "You analyzed a codebase and produced this brief: {brief_json}.
   
   Identify the 5 most important areas where the analysis is shallow or incomplete.
   For each gap:
   - area: short name
   - missing: what information is missing
   - investigationPlan: specific files to read or searches to perform
   - questions: 2-3 specific questions to answer
   
   Focus on: unexplored modules, unclear data flows, missing integration details,
   untested assumptions about architecture, and business logic that wasn't traced."
```

#### 3.5 UI indication of analysis depth

**File:** `src/components/` (analyze button / brief display)

- Show "Standard" vs "Deep" analysis option in the analyze UI
- Display a badge on the brief indicating which depth was used
- Show cycle progress during deep analysis (Cycle 1 of 2, etc.)

### Acceptance Criteria

- [ ] `depth: "deep"` parameter accepted by analyze endpoint
- [ ] Deep analysis runs 2 exploration cycles with gap analysis between them
- [ ] Gap analysis correctly identifies underexplored areas
- [ ] Cycle 2 exploration is more focused than cycle 1
- [ ] Final synthesis incorporates findings from both cycles
- [ ] Progress events correctly reflect multi-cycle progress
- [ ] Deep analysis produces measurably richer briefs than standard (manual review)
- [ ] Deep mode is gated behind appropriate plan/usage limits
- [ ] EmbeddingStore (if Phase 1 done) persists across cycles

---

## Phase 4: Multi-Platform Support — ⏸ Deferred

### Goal

Support GitLab and Bitbucket repositories in addition to GitHub.

### How DeepWiki Does It

DeepWiki has platform-specific API clients for GitHub, GitLab, and Bitbucket that each implement:
- Repository cloning (with token injection into clone URLs)
- File content fetching (for on-demand reads)
- File tree retrieval (for wiki structure determination)

### Our Approach

Abstract the GitHub-specific code behind a platform interface, then implement GitLab and Bitbucket adapters.

#### 4.1 Define platform interface

**New file:** `src/lib/platforms/types.ts`

```typescript
interface PlatformClient {
  fetchRepoInfo(owner: string, repo: string): Promise<RepoInfo>
  fetchRepoTree(owner: string, repo: string): Promise<FileNode[]>
  fetchFileContent(owner: string, repo: string, path: string): Promise<string>
  fetchPRs(owner: string, repo: string): Promise<PRSummary[]>
  fetchCommits(owner: string, repo: string): Promise<CommitSummary[]>
  searchCode(owner: string, repo: string, query: string): Promise<SearchResult[]>
}

type Platform = "github" | "gitlab" | "bitbucket"

function detectPlatform(url: string): Platform
function createPlatformClient(platform: Platform, token?: string): PlatformClient
```

#### 4.2 Refactor GitHub client

**Refactor:** `src/lib/github.ts` → `src/lib/platforms/github.ts`

Wrap existing functions into a class implementing `PlatformClient`. Minimal logic changes — mostly restructuring.

Update all imports across the codebase (analyze route, executor, orchestrator).

#### 4.3 Implement GitLab client

**New file:** `src/lib/platforms/gitlab.ts`

Key API differences from GitHub:
- File tree: `GET /projects/:id/repository/tree?recursive=true` (paginated, 100 per page)
- File content: `GET /projects/:id/repository/files/:path/raw?ref=main`
- MRs (not PRs): `GET /projects/:id/merge_requests?state=merged`
- Commits: `GET /projects/:id/repository/commits`
- Code search: `GET /projects/:id/search?scope=blobs&search=query`
- Project ID: Must be URL-encoded `owner/repo` or fetched via `GET /projects?search=repo`

Use `node-fetch` or similar for API calls (no dedicated GitLab SDK needed for these endpoints).

#### 4.4 Implement Bitbucket client

**New file:** `src/lib/platforms/bitbucket.ts`

Key API differences:
- File tree: `GET /repositories/{workspace}/{repo}/src/{branch}/?pagelen=100` (paginated, recursive)
- File content: `GET /repositories/{workspace}/{repo}/src/{branch}/{path}`
- PRs: `GET /repositories/{workspace}/{repo}/pullrequests?state=MERGED`
- Commits: `GET /repositories/{workspace}/{repo}/commits`
- Code search: `GET /repositories/{workspace}/{repo}/search?search_query=query` (Bitbucket Cloud only)

#### 4.5 Update URL parsing and routing

**File:** `src/lib/platforms/types.ts` (or `src/lib/platforms/index.ts`)

```
detectPlatform(url):
  - github.com → "github"
  - gitlab.com → "gitlab"  
  - bitbucket.org → "bitbucket"
  - Custom domains: check for GitLab/Bitbucket indicators, or accept platform hint from user
```

**File:** `src/app/api/analyze/route.ts`

Replace direct GitHub function calls with platform-agnostic client:
```
const platform = detectPlatform(repoUrl)
const client = createPlatformClient(platform, token)
const repoInfo = await client.fetchRepoInfo(owner, repo)
// ... rest of pipeline unchanged
```

#### 4.6 Update executor for multi-platform

**File:** `src/lib/agent/executor.ts`

Replace Octokit calls with the platform client. The `searchCode` tool may need graceful degradation — GitLab and Bitbucket code search APIs are less capable than GitHub's:
- GitLab: Basic text search, no regex, limited to blobs
- Bitbucket: Search may not be available for all repos

If `searchCode` is unavailable for a platform, the agent should rely more on `searchSemantic` (Phase 1) and `listDirectory` + `readFile`.

#### 4.7 Update token management

**File:** `src/lib/` (profiles/auth related)

- Store platform-specific tokens in user profiles (gitlab_token, bitbucket_token alongside github_token)
- Or use a generic `platform_tokens: { github?: string, gitlab?: string, bitbucket?: string }` JSON column
- Update the brief/analyze UI to accept GitLab/Bitbucket URLs and prompt for tokens if needed

### Acceptance Criteria

- [ ] GitLab repos can be analyzed end-to-end
- [ ] Bitbucket repos can be analyzed end-to-end
- [ ] Platform is auto-detected from URL
- [ ] Existing GitHub functionality is unchanged
- [ ] Agent gracefully handles missing code search on non-GitHub platforms
- [ ] Token management supports all three platforms
- [ ] URL parser handles common URL formats for all platforms

---

## Phase 5: Local Clone Option for Heavy Analysis — ⏸ Deferred

### Goal

For large repos or deep analysis, optionally clone the repo locally to eliminate GitHub API rate limits and enable unlimited file reads.

### How DeepWiki Does It

DeepWiki always clones — `git clone` via subprocess into `~/.adalflow/repos/`. Simple but storage-heavy.

### Our Approach

Make cloning optional and ephemeral — used only when the API-based approach hits its limits.

#### 5.1 Determine when to clone

Heuristic: Clone when:
- File tree has >5,000 files
- Deep analysis mode is selected (Phase 3)
- User explicitly requests it
- Previous analysis of same repo failed due to API rate limits

#### 5.2 Implement clone service

**New file:** `src/lib/cloneService.ts`

```
async cloneRepo(repoUrl: string, token?: string): Promise<{ path: string, cleanup: () => void }>
  - Clone to a temp directory (os.tmpdir())
  - Shallow clone (--depth 1) to minimize size
  - Return path and cleanup function
  - Cleanup removes the directory

async readLocalFile(repoPath: string, filePath: string): Promise<string>
async listLocalDirectory(repoPath: string, dirPath: string): Promise<string[]>
async searchLocalCode(repoPath: string, query: string, glob?: string): Promise<SearchResult[]>
  - Use ripgrep or simple recursive grep for code search
```

#### 5.3 Adapt executor for local mode

**File:** `src/lib/agent/executor.ts`

When a local clone is available, the executor's tools should read from the filesystem instead of calling GitHub API:
- `readFile` → read from local clone (no API call, no budget impact)
- `listDirectory` → list local directory
- `searchCode` → ripgrep against local clone
- `readFileLines` → read from local clone

This removes the 120 API call constraint entirely for cloned repos.

#### 5.4 Infrastructure considerations

**Important:** This requires a server environment with filesystem access and enough disk space. This is NOT compatible with:
- Vercel serverless functions (read-only filesystem, 250MB limit, 5-min timeout)
- Edge functions

Options:
- Run clone-based analysis on a separate worker (e.g., a small VPS, Railway, Fly.io)
- Use Vercel's `/tmp` directory (limited to 512MB, cleared between invocations)
- Queue-based: API endpoint enqueues the job, worker processes it, stores result in Supabase

This phase has the most infrastructure complexity and should only be pursued after Phases 1-3 prove insufficient for large repo coverage.

### Acceptance Criteria

- [ ] Repos can be cloned to ephemeral storage
- [ ] Agent tools work against local filesystem when clone is available
- [ ] Clone is cleaned up after analysis completes (or on timeout)
- [ ] Fallback to API-based analysis if clone fails
- [ ] No impact on standard (non-clone) analysis flow

---

## Phase 6: Persist Embeddings in pgvector — 🚧 In progress

### Goal

Make the Phase 1 `EmbeddingStore` persistent across analyses. Today the store is rebuilt from scratch every run — the same chunks are re-embedded every time the same repo is re-analyzed (or even just re-run at the same commit). DeepWiki-open caches its FAISS index to disk (`~/.adalflow/`) for exactly this reason.

### How DeepWiki Does It

On repo clone, DeepWiki computes embeddings for every file and writes the FAISS index + metadata to `~/.adalflow/repos/{owner-repo}/`. Subsequent runs load from disk and skip embedding entirely.

### Our Approach

Stay hybrid — we still embed on-demand (not the full repo upfront), but write results through to Supabase `pgvector` keyed by `(repo_slug, commit_sha, path, start_line)`. On a new analysis:

1. Capture the current HEAD commit SHA (use `commits[0].sha`).
2. Load any existing embeddings for `(repo_slug, commit_sha)` into memory.
3. Seed / auto-index only the paths not already present.
4. On every new chunk, insert into `repo_embeddings` write-through.
5. Search stays in-memory cosine (chunk counts are small — ivfflat ANN isn't needed yet, but the index exists for future growth).

Reruns at the same commit become free on the embedding side. Reruns at a new commit re-embed only the changed paths if we extend the key to path-level — for v1 we key per-commit, accepting re-embedding when the SHA changes.

### Implementation

#### 6.1 Migration — `supabase/migrations/009_repo_embeddings.sql`

- `create extension if not exists vector;`
- Table `public.repo_embeddings`:
  - `id uuid pk`, `repo_slug text`, `commit_sha text`, `path text`, `start_line int`, `end_line int`, `snippet text`, `content text`, `embedding vector(256)`, `model text`, `created_at timestamptz`
  - Unique `(repo_slug, commit_sha, path, start_line)` to make write-through idempotent
  - B-tree index on `(repo_slug, commit_sha)` for the load query
  - ivfflat index on `embedding vector_cosine_ops` (lists=100) — not used today but ready if we swap search to pgvector
- RLS: deny by default; server writes via service role client.

#### 6.2 Extend `EmbeddingStore`

**File:** `src/lib/agent/vectorSearch.ts`

- Constructor accepts `{ repoSlug?, commitSha?, supabase? }`. If all three are present, persistence is on.
- `async loadFromDb()` — select all chunks for `(repo_slug, commit_sha)` into memory; mark their paths as indexed so `addDocuments` skips them.
- `addDocuments` — after embedding a new chunk, upsert into `repo_embeddings` alongside the in-memory push. Batched.
- Failures on persistence must degrade gracefully — the in-memory store keeps working.

#### 6.3 Wire orchestrator

**File:** `src/lib/agent/orchestrator.ts`

- `createAndSeedEmbeddingStore` takes `commits` so we can grab `commits[0].sha`.
- Build the store with `{ repoSlug: repoInfo.fullName, commitSha: headSha, supabase: createServiceClient() }`.
- Call `loadFromDb()` before `seedEmbeddingStore`.
- Emit a progress event noting how many chunks were loaded from cache.

#### 6.4 Update `Database` type

**File:** `src/lib/supabase/types.ts` — add `repo_embeddings` Row/Insert/Update types so the service client is typed.

### Acceptance Criteria

- [ ] Second analysis of the same repo at the same SHA performs zero embedding API calls (verified via log count).
- [ ] First analysis at a new SHA behaves identically to today (no regression).
- [ ] Persistence failure does not break analysis — warning logged, in-memory store still populated.
- [ ] Unique constraint prevents duplicate rows when the same analysis re-enters a file.
- [ ] Deep mode benefits across its two cycles (second cycle already shares the store in-memory today; this adds persistence across runs).

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Table grows unbounded | v1 accepts unbounded growth; add TTL cleanup job once storage is a concern |
| pgvector extension not enabled on existing Supabase project | Migration enables it idempotently (`create extension if not exists vector`) |
| Service role key leaked via client bundle | Only used from server runtime (`createServiceClient()` is server-only) |
| SHA changes invalidate the entire cache | v1 accepts this; a future optimization can key per-path content hash to survive SHA changes |

---

## File Map

### New Files

| File | Phase | Purpose |
|------|-------|---------|
| `src/lib/agent/vectorSearch.ts` | 1 | Embedding store + semantic search |
| `src/lib/platforms/types.ts` | 4 | Platform interface definitions |
| `src/lib/platforms/github.ts` | 4 | GitHub client (refactored from github.ts) |
| `src/lib/platforms/gitlab.ts` | 4 | GitLab client |
| `src/lib/platforms/bitbucket.ts` | 4 | Bitbucket client |
| `src/lib/platforms/index.ts` | 4 | Platform detection + factory |
| `src/lib/cloneService.ts` | 5 | Local clone management |
| `supabase/migrations/009_repo_embeddings.sql` | 6 | pgvector extension + `repo_embeddings` table |

### Modified Files

| File | Phase(s) | Changes |
|------|----------|---------|
| `package.json` | 1 | Add embedding dependency (openai or similar) |
| `src/lib/agent/executor.ts` | 1, 4, 5 | Add searchSemantic tool, auto-index on readFile, platform abstraction, local clone support |
| `src/lib/agent/orchestrator.ts` | 1, 2, 3 | Seed embedding store, multi-cycle orchestration, enhanced progress events |
| `src/lib/agent/prompts.ts` | 1, 2, 3 | Add searchSemantic guidance, expand diagram types, add gap analysis prompt |
| `src/app/api/analyze/route.ts` | 3, 4 | Accept depth param, platform detection |
| `src/lib/types.ts` | 2, 3 | Add new diagram types to ProjectBrief, add depth field |
| `src/components/sections/OverviewSection.tsx` | 2 | Render new diagram types |
| `src/lib/github.ts` | 4 | Refactor to platform interface (may be moved) |

---

## Testing Strategy

### Phase 1 (Semantic Search)
- Unit test `EmbeddingStore`: add documents, search, verify relevance ranking
- Integration test: run analysis on a known repo, verify `searchSemantic` is called by the agent
- Compare analysis output with/without semantic search on 3-5 test repos
- Verify embedding API calls don't count against GitHub budget

### Phase 2 (Diagrams)
- Validate new diagram types render in Mermaid (unit test with sample syntax)
- Run synthesis on test repos, verify new diagram fields are populated
- Visual QA: check diagrams render correctly in the UI
- Test graceful omission of ER diagram when repo has no data models

### Phase 3 (Deep Research)
- Run standard vs deep analysis on 3 complex repos, compare brief quality
- Verify gap analysis identifies real gaps (manual review)
- Verify cycle 2 explores different files than cycle 1
- Test timeout handling for longer deep analysis
- Verify progress events correctly reflect multi-cycle state

### Phase 4 (Multi-Platform)
- Test GitLab analysis on public GitLab repos (e.g., gitlab.com/gitlab-org/gitlab)
- Test Bitbucket analysis on public Bitbucket repos
- Verify URL detection for all three platforms
- Test token injection for private repos on each platform
- Verify graceful degradation when code search is unavailable

### Phase 5 (Local Clone)
- Test clone + cleanup lifecycle
- Test local file reads match API-based reads
- Test clone timeout and disk space limits
- Verify fallback to API mode on clone failure

---

## Risks & Mitigations

| Risk | Phase | Impact | Mitigation |
|------|-------|--------|------------|
| Embedding API costs add up | 1 | Medium | Budget ~10-15 seed files + auto-index only read files; use smaller model (text-embedding-3-small at 256 dims is cheap) |
| Semantic search returns low-quality results | 1 | Medium | Code-aware chunking (not word-based); agent can still fall back to searchCode and readFile |
| New diagram types cause synthesis failures | 2 | Low | Make new diagrams optional in the schema; validate before including in brief |
| Deep analysis takes too long | 3 | Medium | Set hard timeout (10 min); reduce cycle 2 budget; show progress to user |
| Deep analysis costs 2-3x standard | 3 | Medium | Gate behind Pro plan or usage multiplier |
| GitLab/Bitbucket APIs are less capable | 4 | Medium | Graceful degradation for code search; lean on semantic search (Phase 1) as fallback |
| Local clone disk space issues | 5 | Medium | Shallow clone (--depth 1); cleanup on completion and timeout; size limits |
| Vercel serverless can't support local clone | 5 | High | Defer to separate worker infrastructure; don't attempt on serverless |

---

## Dependencies Between Phases

```
Phase 1 (Semantic Search) ──────┐
                                 ├──→ Phase 3 (Deep Research) benefits from
Phase 2 (Diagrams) ─────────────┘     persistent embedding store across cycles

Phase 1 (Semantic Search) ──────────→ Phase 4 (Multi-Platform) benefits from
                                       semantic search when code search is unavailable

Phase 4 (Multi-Platform) ──────────→ Phase 5 (Local Clone) needs platform-aware
                                       clone URLs with token injection
```

**Recommended implementation order:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phases 1 and 2 can be done in parallel as they touch mostly different files. Phase 3 benefits from Phase 1 being complete. Phase 4 is independent but benefits from Phase 1. Phase 5 depends on Phase 4 for multi-platform clone support.
