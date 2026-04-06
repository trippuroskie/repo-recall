# Agentic Codebase Analysis & Comprehensive UI Plan

## Vision

Transform RepoRecall from static pattern-matching analysis into an **agentic, iterative code exploration system** that reads, searches, and reasons about code like a developer — with a UI that surfaces deep understanding through hierarchical codemaps, inline citations, and real-time exploration visibility.

---

## Phase 1: Agentic Analysis Engine

### 1.1 Analysis Agent Loop

**Goal:** Replace the current single-pass `generateBrief()` with an LLM-driven exploration loop that iteratively reads files, searches patterns, and builds understanding.

**Current state:** `src/lib/analysis.ts` uses regex/pattern matching on file paths and `package.json` — it never reads actual file contents beyond README.

**New architecture:**

```
┌─────────────────────────────────────────────────┐
│                  Analysis Orchestrator           │
│  (manages agent loop, accumulates findings)      │
├─────────────────────────────────────────────────┤
│                                                  │
│  1. Fetch repo metadata + file tree (existing)   │
│  2. Send file tree + README to LLM              │
│  3. LLM returns exploration plan (tool calls)    │
│  4. Execute tools: readFile, searchCode, listDir │
│  5. Feed results back to LLM                     │
│  6. LLM either requests more tools or produces   │
│     structured findings                          │
│  7. Repeat steps 3-6 until LLM signals done      │
│  8. LLM generates final structured brief         │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Files to create/modify:**

- **`src/lib/agent/tools.ts`** — Define tool schemas the LLM can call:
  ```typescript
  type AgentTool =
    | { name: "readFile"; params: { path: string } }
    | { name: "searchCode"; params: { query: string; glob?: string } }
    | { name: "listDirectory"; params: { path: string } }
    | { name: "readFileLines"; params: { path: string; startLine: number; endLine: number } }
  ```

- **`src/lib/agent/executor.ts`** — Execute tools against GitHub API:
  - `readFile`: Fetch file content via GitHub Contents API (existing `/api/file` pattern)
  - `searchCode`: Use GitHub Code Search API (`GET /search/code?q={query}+repo:{owner}/{repo}`)
  - `listDirectory`: Filter file tree by path prefix
  - `readFileLines`: Fetch file + extract line range
  - Rate limit awareness: track remaining GitHub API calls, batch requests

- **`src/lib/agent/orchestrator.ts`** — Main agent loop:
  - Initialize with repo metadata, file tree, README
  - System prompt instructs LLM to explore methodically:
    1. First pass: identify architecture from file tree + key config files
    2. Second pass: read entry points, trace imports, understand data flow
    3. Third pass: deep-dive into specific modules for detailed understanding
  - Max iterations cap (e.g., 20 tool-call rounds) to control cost
  - Accumulate an `ExplorationContext` object with findings per iteration
  - Final call: LLM synthesizes all findings into structured `ProjectBrief`

- **`src/lib/agent/prompts.ts`** — Agent system prompts:
  - Exploration prompt: "You are analyzing a codebase. Use the provided tools to understand its architecture, features, and patterns. Be systematic — start with entry points, follow imports, identify patterns."
  - Synthesis prompt: "Given all findings below, produce a structured ProjectBrief with citations to specific files and line numbers."

- **Modify `src/lib/analysis.ts`** — Keep existing functions as fallbacks, add `generateBriefAgentic()` as the new primary path. Existing `inferStack`, `identifyKeyModules` etc. become seed data for the agent's first iteration.

**Constraints:**
- GitHub API rate limits: 5,000 req/hr with token, 60 without. Budget ~50-100 API calls per analysis.
- LLM cost: ~20 tool-call rounds × ~4K tokens each = ~80K tokens per analysis. Use a fast model (Claude Haiku or GPT-4o-mini) for exploration, Sonnet for synthesis.
- File size limits: Skip files >100KB, binary files, generated files (lock files, bundles).

### 1.2 Real-time Progress Streaming

**Goal:** Stream the agent's exploration steps to the client in real-time, showing what files are being read and what's being discovered.

**Current state:** `/api/analyze` returns a single JSON response after the entire analysis completes. No progress visibility.

**New architecture:**

- **Modify `src/app/api/analyze/route.ts`** — Convert to SSE streaming endpoint:
  ```
  data: {"type":"step","action":"readFile","path":"src/index.ts","status":"reading"}
  data: {"type":"step","action":"readFile","path":"src/index.ts","status":"done"}
  data: {"type":"step","action":"searchCode","query":"export default","status":"reading"}
  data: {"type":"finding","category":"architecture","summary":"Uses Next.js App Router with RSC"}
  data: {"type":"progress","current":3,"total":12,"phase":"exploring"}
  data: {"type":"complete","brief":{...}}
  ```

- **`src/lib/agent/orchestrator.ts`** — Accept a callback/emitter for progress events:
  ```typescript
  type ProgressEvent =
    | { type: "step"; action: string; detail: string; status: "started" | "done" }
    | { type: "finding"; category: string; summary: string }
    | { type: "progress"; phase: string; current: number; total: number }
    | { type: "complete"; brief: ProjectBrief }
    | { type: "error"; message: string }
  ```

- **`src/components/AnalysisProgress.tsx`** — New component showing live exploration:
  - Progress bar with phase labels ("Exploring structure", "Reading entry points", "Tracing data flow", "Generating brief")
  - Scrolling log of agent actions (like DeepWiki's right panel):
    ```
    - Read package.json
    - Read src/app/layout.tsx
    - Searched for "createClient"
    - Read src/lib/supabase.ts
    - Finding: Uses Supabase for auth and database
    - Read src/app/api/analyze/route.ts
    ```
  - Phase counter (e.g., "2 / 4")
  - Smooth animations for new log entries

- **Modify `src/app/dashboard/page.tsx`** or create **`src/app/analyze/[id]/page.tsx`** — New page that shows analysis progress, then transitions to the brief view on completion.

---

## Phase 2: Vector Embeddings & RAG

### 2.1 Code Embedding Pipeline

**Goal:** Embed code chunks at analysis time so chat can retrieve relevant code via semantic similarity instead of keyword matching.

**Current state:** Chat in `/api/chat/route.ts` scores files by counting query word matches against file paths. Max 5 files, 30KB context.

**New architecture:**

- **`src/lib/embeddings.ts`** — Embedding generation:
  - Chunk strategy: Split files into semantic units (functions, classes, or ~100-line blocks)
  - Each chunk gets metadata: `{ filePath, startLine, endLine, chunkType, content }`
  - Generate embeddings via OpenAI `text-embedding-3-small` (cheap, fast, 1536 dims)
  - Batch embed all chunks for a repo during analysis

- **Database: New `code_chunks` table:**
  ```sql
  CREATE TABLE code_chunks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brief_id text REFERENCES briefs(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    start_line integer,
    end_line integer,
    chunk_type text,  -- 'function', 'class', 'block', 'config'
    content text NOT NULL,
    embedding vector(1536),
    created_at timestamptz DEFAULT now()
  );

  CREATE INDEX ON code_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  CREATE INDEX ON code_chunks (brief_id);
  ```

  Requires enabling `pgvector` extension in Supabase:
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```

- **Modify `src/app/api/chat/route.ts`** — Replace keyword scoring with vector search:
  1. Embed user query
  2. Query `code_chunks` with cosine similarity, top-k=15
  3. Deduplicate by file, merge adjacent chunks
  4. Include matched chunks (with file path + line numbers) in system prompt
  5. Fall back to keyword scoring if embeddings not yet generated

### 2.2 Deep Research Mode

**Goal:** Multi-iteration chat for complex questions (like DeepWiki's "Deep Research").

- **`src/lib/chat/deepResearch.ts`** — Multi-step reasoning:
  1. User asks complex question
  2. First LLM call: analyze question, identify what code to examine
  3. Retrieve relevant chunks via vector search
  4. Second LLM call: examine code, identify follow-up questions
  5. Retrieve additional chunks for follow-ups
  6. Final LLM call: synthesize comprehensive answer
  - Max 3-5 iterations
  - Stream intermediate "thinking" steps to user

- **UI: Toggle in ChatPanel** — "Deep Research" toggle button next to send:
  - Normal mode: single retrieval + response (fast)
  - Deep mode: multi-iteration with visible reasoning steps
  - Show "Searching for X...", "Reading Y...", "Analyzing Z..." progress

---

## Phase 3: Hierarchical Codemap UI

### 3.1 Structured Codemap Generation

**Goal:** Generate a hierarchical, numbered codemap with inline source citations — not just a flat brief.

**Current state:** `CodemapSection.tsx` renders 6 hardcoded expandable sections (Entry Points, Core Modules, API Layer, Features, Tech Stack, Overview) built from brief data. No LLM-generated structure, no source citations.

**New data structure:**

```typescript
interface CodemapNode {
  id: string;            // e.g., "1", "1a", "2c"
  title: string;
  description: string;   // Markdown with [[file:path:line]] citations
  children: CodemapNode[];
  citations: Citation[];
  diagram?: string;      // Mermaid diagram source
}

interface Citation {
  id: string;            // e.g., "[1a]"
  filePath: string;
  startLine?: number;
  endLine?: number;
  snippet?: string;      // Brief code excerpt
}

interface Codemap {
  title: string;
  summary: string;
  nodes: CodemapNode[];
}
```

- **Add to agent synthesis step** — After exploration, generate codemap structure:
  - LLM produces hierarchical sections based on actual code understanding
  - Each section includes citations to files/lines the agent actually read
  - Sections are numbered (1, 1a, 1b, 2, 2a, etc.)

- **Modify `ProjectBrief` type** — Add `codemap: Codemap` field alongside existing sections

- **Database** — Add `codemap jsonb` column to `briefs` table

### 3.2 Codemap UI Component

**Goal:** Interactive, expandable hierarchy with inline citations and linked code viewer.

**Redesign `src/components/sections/CodemapSection.tsx`:**

```
┌──────────────────────────────────┬──────────────────────────────┐
│  Codemap Navigation              │  Code Viewer (multi-tab)     │
│                                  │                              │
│  ▼ 1 SDK Initialization          │  ┌────────┬─────────┬──────┐│
│    1a Bootstrap [codex.ts:11]    │  │codex.ts│thread.ts│exec.ts││
│    1b Options [codexOpts:15]     │  ├────────┴─────────┴──────┤│
│    1c Exec Setup [exec.ts:17]    │  │ 1  import { CodexOpts } ││
│  ▶ 2 Thread Execution            │  │ 2  import { CodexExec } ││
│  ▼ 3 Event Processing            │  │ 3  import { Thread }    ││
│    3a Read Stream [thread:97]    │  │ ...                      ││
│    3b Parse Event                 │  │11  export class Codex { ││ ← highlighted
│  ▶ 4 Configuration               │  │12    private exec;      ││
│  ▶ 5 Binary Discovery            │  │ ...                      ││
│                                  │                              │
│  [Mermaid diagram]               │                              │
└──────────────────────────────────┴──────────────────────────────┘
```

**Components to build:**

- **`src/components/codemap/CodemapTree.tsx`** — Left panel:
  - Recursive tree rendering of `CodemapNode[]`
  - Expand/collapse with smooth animations
  - Numbered labels (1, 1a, 1b, 2, 2a...)
  - Click citation → updates code viewer
  - Active node highlighting
  - Search/filter within tree

- **`src/components/codemap/CodemapDetail.tsx`** — Content for selected node:
  - Markdown rendered description with clickable `[1a]` style citations
  - Inline Mermaid diagrams per section
  - "Sources" footer listing all referenced files
  - "See guide" links for detailed flow explanations

- **`src/components/codemap/MultiTabCodeViewer.tsx`** — Right panel:
  - Extends existing `CodeViewer` with multi-file tabs
  - File breadcrumb path (e.g., `sdk > typescript > src > codex.ts`)
  - Synchronized highlighting when clicking citations
  - Tab management (open/close/reorder)
  - Split view option for comparing two files

- **`src/components/codemap/CodemapDiagram.tsx`** — Per-section diagrams:
  - Renders Mermaid diagrams generated for each codemap section
  - Clickable nodes → navigate to relevant code
  - Full-screen modal view
  - Multiple diagram types: flowcharts, sequence diagrams, class diagrams

### 3.3 Brief Page Layout Redesign

**Modify `src/app/brief/[id]/page.tsx`:**

- Default view: Codemap (full-width with integrated code viewer)
- Tab bar to switch between: **Codemap** | Overview | Architecture | Features | Business | Timeline | Entry Points
- Codemap takes full page width (no max-width constraint)
- Chat panel overlays as a slide-out drawer (bottom or right)
- Mobile: Codemap tree collapses to accordion, code viewer goes full-screen on tap

---

## Phase 4: Enhanced Chat Experience

### 4.1 Citation-Linked Chat

**Modify `src/components/ChatPanel.tsx`:**

- Chat responses include numbered citations: "The auth middleware [1] validates JWT tokens before passing to route handlers [2]"
- Citations rendered as superscript badges
- Hover citation → tooltip with file path and code snippet
- Click citation → opens file in code viewer at exact line
- "Sources" section at bottom of each response listing all referenced files

### 4.2 Exploration-Aware Chat

- When user asks about a specific area, the chat agent can trigger additional file reads
- Show "Reading src/lib/auth.ts..." indicator during retrieval
- Chat context includes codemap structure so LLM knows what's been analyzed
- Suggest follow-up questions based on codemap sections not yet explored

---

## Phase 5: Polish & Performance

### 5.1 Caching & Incremental Updates

- Cache fetched file contents during analysis (avoid re-fetching in chat)
- Store raw file contents in Supabase Storage or a `file_cache` table
- Incremental re-analysis: only re-explore files changed since last analysis (via git diff)
- Cache embeddings — only re-embed changed files

### 5.2 Cost Controls

- Track token usage per analysis (LLM calls + embeddings)
- Budget allocation: exploration (60%), synthesis (30%), embeddings (10%)
- Auto-throttle: reduce exploration depth for very large repos (>1000 files)
- Model routing: Haiku for exploration tool calls, Sonnet for synthesis
- Display estimated cost before analysis starts (Pro plan)

### 5.3 File Tree Intelligence

- Smart file filtering: skip `node_modules`, `dist`, `build`, `.git`, lock files, binary files
- Priority ordering: entry points first, then by import frequency
- Language-aware chunking for embeddings (AST-based for JS/TS/Python)

---

## Implementation Order

### Sprint 1: Agent Foundation (1-2 weeks)
1. `src/lib/agent/tools.ts` — Tool definitions
2. `src/lib/agent/executor.ts` — GitHub API tool execution
3. `src/lib/agent/orchestrator.ts` — Agent loop with progress events
4. `src/lib/agent/prompts.ts` — Exploration + synthesis prompts
5. Modify `/api/analyze` to use agentic pipeline with SSE streaming
6. `src/components/AnalysisProgress.tsx` — Progress UI

### Sprint 2: Codemap Data & UI (1-2 weeks)
7. Define `Codemap` types, add to `ProjectBrief`
8. Agent synthesis produces codemap structure with citations
9. `src/components/codemap/CodemapTree.tsx`
10. `src/components/codemap/CodemapDetail.tsx`
11. `src/components/codemap/MultiTabCodeViewer.tsx`
12. Integrate codemap view into brief page

### Sprint 3: Vector Search & RAG (1 week)
13. Enable pgvector in Supabase
14. `code_chunks` table + migration
15. `src/lib/embeddings.ts` — Chunking + embedding pipeline
16. Modify `/api/chat` — Vector similarity retrieval
17. Deep Research mode (multi-iteration chat)

### Sprint 4: Polish (1 week)
18. Per-section Mermaid diagrams
19. Citation-linked chat responses
20. Caching layer for file contents
21. Cost controls and model routing
22. Mobile responsive codemap UI

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| GitHub API rate limits during agentic exploration | Analysis fails mid-way | Budget API calls, batch requests, cache aggressively, fallback to existing static analysis |
| LLM cost per analysis too high | Unsustainable for free tier | Use cheap models for exploration, cap iterations, offer deep analysis only on Pro |
| Large repos (>5000 files) overwhelm agent | Timeout, excessive cost | Smart file filtering, depth limits, focus on entry points + most-imported files |
| Embedding storage costs | Database bloat | Limit chunks per repo (~500), delete on brief deletion (CASCADE), compress |
| Codemap quality varies by repo | Inconsistent UX | Fallback to existing brief sections if codemap generation fails, A/B test |

---

## Success Metrics

- **Analysis depth**: Number of files actually read per analysis (target: 20-50, up from 0)
- **Chat relevance**: % of chat responses that include correct file citations (target: 80%+)
- **User engagement**: Time spent in codemap view vs. old brief view
- **Cost efficiency**: Average LLM cost per analysis (target: <$0.15 free tier, <$0.50 pro)
- **Speed**: Analysis completes within 60 seconds for repos <500 files
