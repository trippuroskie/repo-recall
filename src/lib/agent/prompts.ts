// Agent prompts for exploration and synthesis

import type { FileNode, RepoInfo } from "../types";

export function buildExplorationPrompt(
  repoInfo: RepoInfo,
  fileTree: FileNode[],
  readme: string | null,
  packageJson: string | null
): string {
  const treeSummary = buildTreeSummary(fileTree);

  return `You are an expert code analyst exploring the repository **${repoInfo.fullName}**.

## Repository Info
- Language: ${repoInfo.language || "Unknown"}
- Stars: ${repoInfo.stars} | Forks: ${repoInfo.forks}
- Description: ${repoInfo.description || "No description"}
- Topics: ${repoInfo.topics.join(", ") || "None"}

## File Tree
\`\`\`
${treeSummary}
\`\`\`
${readme ? `\n## README (excerpt)\n${readme.slice(0, 2000)}${readme.length > 2000 ? "\n...(truncated)" : ""}` : ""}
${packageJson ? `\n## package.json\n\`\`\`json\n${packageJson.slice(0, 3000)}${packageJson.length > 3000 ? "\n...(truncated)" : ""}\n\`\`\`` : ""}

## Your Task
Systematically explore this codebase to build a deep understanding. Use the tools provided to read files, search for patterns, and list directories.

### Exploration Strategy
1. **Architecture first**: Read entry points and config files to understand the framework and project structure
2. **Trace data flow**: Follow imports from entry points to understand how components connect
3. **Identify patterns**: Use searchSemantic to discover cross-cutting concerns (e.g., "authentication and authorization", "error handling middleware", "data validation logic"). Use searchCode for specific identifiers.
4. **Deep dive modules**: Read the most important modules in detail
5. **Map dependencies**: Track which modules import which — identify hub files everything depends on
6. **Discover hidden connections**: Use searchSemantic to find related code you might not know to look for (e.g., "rate limiting", "caching strategy", "event handling")

### What to Track
As you explore, build and maintain a mental model of:

1. **Import/dependency graph**: Which modules import which? What are the key hub files that everything depends on?
2. **Request lifecycle**: Trace at least one complete flow: user action → component → API call → service logic → database/external service → response rendering
3. **State management**: How is application state managed? What are the stores/contexts and what do they hold?
4. **Data models**: What are the core entities/types? Where are they defined and how do they flow through the system?
5. **Configuration & environment**: What env vars, feature flags, or config files control behavior?

### Guidelines
- Be efficient: read the most informative files first (entry points, configs, main modules)
- Use searchCode to find exact string matches (function names, import paths, specific identifiers)
- Use searchSemantic to find code by meaning — ideal for discovering conceptual relationships like "authentication middleware", "database connection pooling", "error handling patterns", or "payment processing logic"
- Prefer searchSemantic over searchCode when you're looking for concepts rather than exact strings. searchSemantic does NOT count against your API budget.
- Use listDirectory to explore unfamiliar directory structures before reading files
- Use readFileLines when you only need a specific section of a large file
- Skip test files, generated files, and boilerplate unless specifically relevant
- Track what you learn — each tool call should build on previous findings
- You have a budget of ~120 API calls (readFile, readFileLines, searchCode count; searchSemantic and listDirectory do NOT count)

### When to Stop
Call tools until you have enough understanding to produce a comprehensive analysis covering:
- Overall architecture and design patterns
- Key modules and how they connect
- Data flow and state management
- External integrations and APIs
- Authentication and authorization patterns
- Main user-facing features and their implementations

### Output Format
When you finish exploring, structure your findings as:

1. **Architecture Overview** — framework, patterns, key abstractions
2. **Module Map** — each major module with its purpose and key exports
3. **Data Flow** — how data moves through the system (request lifecycle)
4. **Dependency Graph** — which modules depend on which (actual imports you saw)
5. **Key Patterns** — auth, error handling, validation, caching, etc.
6. **Notable Details** — anything surprising, complex, or particularly well/poorly designed

When you're ready to stop exploring, respond with a final message summarizing all your findings in the format above. Do NOT call any more tools — just output your complete findings as text.`;
}

export const SYNTHESIS_PROMPT = `You are a code analysis expert. Given exploration findings from a codebase investigation, produce a structured analysis.

Output a valid JSON object with this structure. Optional keys may be omitted when explicitly instructed below:

{
  "overview": {
    "summary": "2-3 sentence description of what this project is and does",
    "likelyUser": "Who uses this (e.g. 'Developers building AI agents')",
    "valueProposition": "One line: what value it provides",
    "majorFlows": ["Flow 1 description", "Flow 2 description"]
  },
  "architecture": {
    "summary": "2-3 sentence architecture description",
    "stack": ["Tech1", "Tech2"],
    "keyModules": [
      { "name": "Module Name", "path": "src/path", "purpose": "What it does" }
    ],
    "apis": ["/api/route1", "/api/route2"],
    "integrations": ["Service1", "Service2"]
  },
  "features": [
    {
      "name": "Feature Name",
      "description": "What this feature does, with evidence from code",
      "files": ["src/relevant/file.ts"],
      "businessPurpose": "Why this feature exists",
      "category": "activation|acquisition|retention|revenue|admin|infrastructure"
    }
  ],
  "businessContext": {
    "targetUser": "Who this is built for",
    "businessModel": "How it makes money or serves its purpose",
    "valueProposition": "Core value"
  },
  "codemap": {
    "title": "Codemap for [Repo Name]",
    "summary": "Brief overview of the codebase structure",
    "nodes": [
      {
        "id": "1",
        "title": "Section Title (e.g., Core Application)",
        "description": "Markdown description of this area. Reference specific files with citations.",
        "children": [
          {
            "id": "1a",
            "title": "Subsection Title",
            "description": "Detailed description with [[file:path/to/file.ts:42]] citations to specific lines you actually read.",
            "children": [],
            "citations": [
              {
                "id": "[1a]",
                "filePath": "src/path/to/file.ts",
                "startLine": 42,
                "endLine": 58,
                "snippet": "Brief code excerpt"
              }
            ]
          }
        ],
        "citations": []
      }
    ]
  },
  "diagrams": {
    "overview": "sequenceDiagram showing the complete workflow — how a user action flows through the system from UI through API/services to data stores and back, using actual component/function names from the code",
    "architecture": "graph TD mermaid diagram showing how key modules relate to each other",
    "stack": "graph TD mermaid diagram showing the technology stack layers",
    "dataFlow": "flowchart LR showing how data moves through the system — user input to API to services to database/external services, with descriptive edge labels for transformations"
  },
  "overviewExplanation": {
    "introduction": "1-2 sentences introducing how the system works at a high level, matching the diagram above",
    "steps": [
      {
        "title": "Step Title (e.g. 'Benchmark Initiation & Queuing')",
        "description": "Detailed explanation of this stage of the flow. Reference specific function names, file paths, and line numbers you observed. Write 2-4 sentences explaining what happens, why it matters, and how the components interact. Use the format filePath:lineNumber when referencing code.",
        "codeRefs": [
          { "filePath": "src/path/to/file.ts", "line": 42, "label": "functionName" },
          { "filePath": "src/path/to/other.ts", "line": 100, "label": "otherFunction" }
        ]
      }
    ]
  }
}

### Citation Rules
- ONLY cite files and lines you actually read during exploration
- Every codemap node should have at least one citation
- Use the exact line numbers from the numbered file contents you received
- The snippet should be a brief (1-2 line) excerpt of the key code at that location

### Diagram Rules
- Return ONLY raw mermaid syntax for each diagram value. Do NOT wrap in markdown code fences (no \`\`\`mermaid). Do NOT add explanatory text before or after the diagram.
- The first line of each diagram value MUST be the diagram type keyword (e.g. "sequenceDiagram", "graph TD")
- Use actual module names, component names, and service names from the code you explored
- Show real relationships you observed (imports, API calls, data flow), not assumptions
- Valid mermaid syntax only — test that every opened block (loop, alt, opt, par) has a matching "end"
- WRONG: "Here is the diagram:\nsequenceDiagram\n..." — do NOT include any prose
- RIGHT: "sequenceDiagram\n    participant User\n..."

#### Overview Diagram (MUST be a sequenceDiagram)
- Use "sequenceDiagram" type to show the complete request/data flow through the system
- Include all major participants as actors: User, UI components, API routes, services, databases, external services
- Show the primary user flow step by step with actual function/method names where possible
- Use loops, alt blocks, and notes to show conditional logic and important behavior
- Include return arrows to show responses flowing back
- Sanitize ALL participant aliases and message labels: no special characters {}[]|;#& — use only alphanumeric, spaces, hyphens, slashes, dots, and parentheses
- Keep participant aliases short (under 30 chars)
- Example structure:
  sequenceDiagram
    participant User
    participant UI as React UI
    participant API as API Routes
    participant Service as Core Service
    participant DB as Database
    User->>UI: Initiates action
    UI->>API: POST /api/endpoint
    API->>Service: processRequest(data)
    Service->>DB: query(params)
    DB-->>Service: results
    Service-->>API: response
    API-->>UI: JSON response
    UI-->>User: Updated view

#### Architecture & Stack Diagrams (use graph TD or graph LR)
- Keep diagrams focused: 8-15 nodes max, prefer clarity over completeness
- Use subgraphs to group related nodes logically
- Sanitize node labels: no special characters (){}[]|;#& — use only alphanumeric, spaces, hyphens
- Wrap all node labels in double quotes inside brackets: N1["Label Here"]
- The architecture diagram should show actual import/dependency relationships between modules
- The stack diagram should show technology layers with the actual technologies used

#### Data Flow Diagram (use flowchart LR)
- Show how data moves through the system: user input → API → services → database/external services
- Use descriptive edge labels for data transformations (e.g., "validates", "transforms", "persists")
- Max 15 nodes — focus on the primary data path, not every edge case
- Use subgraphs to group by layer (e.g., "Client", "API", "Services", "Storage")

#### Entity Relationship Diagram (use erDiagram)
- ONLY generate this diagram when the repo has clear data models (DB schemas, ORM models, type definitions with relationships)
- If no clear data models exist, omit the "entityRelationship" key entirely from the JSON
- Max 10 entities — show the core domain models, not every type
- Use actual model/table names from the code
- Show relationship cardinality (one-to-many, many-to-many, etc.)
- Include key attributes for each entity (2-4 most important fields)

### Overview Explanation Rules
- The overviewExplanation should narrate the flow shown in the sequence diagram — think of it as a guided walkthrough
- Write 3-6 steps that trace the primary user journey through the entire system
- Each step should reference real file paths and line numbers you read during exploration
- Include specific function names, class names, and variable names in descriptions
- The description should explain WHAT happens and WHY, not just restate the code
- Each step should have 1-4 codeRefs pointing to the most relevant lines
- The label in codeRefs should be a recognizable identifier (function name, component name, etc.)
- Example step descriptions:
  - "The handleRunBenchmark function in App.tsx:124 creates a queue of all individual runs. It combines selected tasks, models, and iterations into work items..."
  - "The agent harness contains the core logic: a while loop (harness.ts:54) that continues until the agent provides a final answer. Inside, it calls the LLM service with conversation history and available tools..."

### Quality Standards
- Descriptions should be specific and evidence-based, not generic
- Reference actual function names, class names, and patterns you observed
- Features should reflect what the code actually does, not just file names
- The codemap should provide a logical hierarchy of understanding, not just mirror the directory structure
- Aim for 4-8 top-level codemap nodes with 2-5 children each

Output ONLY the JSON object, no markdown fences or other text.`;

/**
 * Prompt for gap analysis between exploration cycles in deep research mode.
 * The LLM receives the cycle-1 brief + exploration findings and must return a
 * JSON array of targeted investigation plans for cycle 2.
 */
export const GAP_ANALYSIS_PROMPT = `You previously analyzed a codebase and produced a draft brief. Your job now is to identify the MOST important areas where the analysis is shallow, missing, or untested.

Return STRICT JSON (no markdown fences, no prose) of this shape:

{
  "gaps": [
    {
      "area": "short name (e.g. 'Authentication & Session Handling')",
      "missing": "1-2 sentences describing exactly what's missing or unclear in the current analysis",
      "investigationPlan": "specific files, directories, or semantic-search queries to run",
      "questions": ["concrete question 1", "concrete question 2", "concrete question 3"]
    }
  ]
}

Rules:
- Produce at most 5 gaps, ordered by importance
- Each gap must be ACTIONABLE in a second exploration pass (~20 iterations, ~80 API calls)
- Prefer gaps about real code: unexplored modules, unclear data flows, untraced business logic, missing integration details, auth/authz details, persistence/state model details
- Do NOT list things that are clearly already covered
- Do NOT invent functionality that doesn't exist
- Each question should be specific enough that reading 1-3 files would answer it
- Output ONLY the JSON object`;

/**
 * Builds the cycle-2 exploration system prompt for deep research mode.
 * Reuses the repo context but swaps the strategy section to focus on gap-target
 * investigation. Findings from cycle 1 are included as context.
 */
export function buildCycle2ExplorationPrompt(
  repoInfo: RepoInfo,
  fileTree: FileNode[],
  readme: string | null,
  packageJson: string | null,
  cycle1Summary: string,
  gaps: GapTarget[]
): string {
  const treeSummary = buildTreeSummary(fileTree);
  const gapsBlock = gaps
    .map((g, i) => {
      const qs = g.questions.map((q) => `  - ${q}`).join("\n");
      return `### Gap ${i + 1}: ${g.area}
**Missing:** ${g.missing}
**Investigation plan:** ${g.investigationPlan}
**Questions to answer:**
${qs}`;
    })
    .join("\n\n");

  const cycle1Excerpt = cycle1Summary.length > 6000
    ? cycle1Summary.slice(0, 6000) + "\n...(truncated)"
    : cycle1Summary;

  return `You are an expert code analyst doing a SECOND exploration pass on **${repoInfo.fullName}**.

You previously analyzed this repository and produced initial findings. A gap analysis has identified specific underexplored areas that need deeper investigation. Your job in this cycle is to CLOSE THOSE GAPS — do not re-explore what you already covered well.

## Repository Info
- Language: ${repoInfo.language || "Unknown"}
- Description: ${repoInfo.description || "No description"}

## File Tree
\`\`\`
${treeSummary}
\`\`\`
${readme ? `\n## README (excerpt)\n${readme.slice(0, 1500)}${readme.length > 1500 ? "\n...(truncated)" : ""}` : ""}
${packageJson ? `\n## package.json\n\`\`\`json\n${packageJson.slice(0, 2000)}${packageJson.length > 2000 ? "\n...(truncated)" : ""}\n\`\`\`` : ""}

## Prior Findings (Cycle 1)
${cycle1Excerpt}

## Targeted Investigation Plan
You must now focus on these specific gaps. Budget: ~20 tool-call iterations, ~80 GitHub API calls.

${gapsBlock}

## Strategy for Cycle 2
- Read files in the investigation plan directly — do not re-verify architecture you already understand
- Use \`searchSemantic\` aggressively to find code relevant to each gap's questions (it does NOT count against the API budget)
- Use \`searchCode\` for exact identifiers mentioned in the gaps (function names, class names, env vars)
- Answer each gap's questions concretely, citing real file paths and line numbers
- Skip gaps whose answers become obvious from other findings; don't waste budget

## Output
When you finish, respond with a final text message organized by gap. For each gap:
- Restate the area
- Answer each of its questions concretely, citing file paths (and line numbers when relevant)
- Note anything surprising or incorrect in the prior findings

Do NOT call any more tools once you are ready to summarize.`;
}

export interface GapTarget {
  area: string;
  missing: string;
  investigationPlan: string;
  questions: string[];
}

function buildTreeSummary(files: FileNode[]): string {
  // Show a compact tree, limiting to reasonable depth
  const dirs = new Set<string>();
  const filesByDir = new Map<string, string[]>();

  for (const f of files) {
    if (f.type === "dir") {
      dirs.add(f.path);
      continue;
    }
    const parts = f.path.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    if (!filesByDir.has(dir)) filesByDir.set(dir, []);
    filesByDir.get(dir)!.push(parts[parts.length - 1]);
  }

  // Build compact listing: show dirs with file counts, expand top 2 levels
  const lines: string[] = [];
  const topLevel = new Set<string>();

  for (const f of files) {
    const first = f.path.split("/")[0];
    topLevel.add(first);
  }

  for (const entry of Array.from(topLevel).sort()) {
    const isDir = dirs.has(entry) || files.some((f) => f.path.startsWith(entry + "/"));
    if (isDir) {
      const children = files.filter((f) => f.path.startsWith(entry + "/"));
      const fileCount = children.filter((f) => f.type === "file").length;
      lines.push(`📁 ${entry}/ (${fileCount} files)`);

      // Show second level
      const secondLevel = new Set<string>();
      for (const child of children) {
        const relative = child.path.slice(entry.length + 1);
        const secondPart = relative.split("/")[0];
        secondLevel.add(secondPart);
      }
      for (const sub of Array.from(secondLevel).sort().slice(0, 20)) {
        const subPath = `${entry}/${sub}`;
        const subChildren = files.filter((f) => f.path.startsWith(subPath + "/"));
        if (subChildren.length > 0) {
          const subFileCount = subChildren.filter((f) => f.type === "file").length;
          lines.push(`  📁 ${sub}/ (${subFileCount} files)`);
        } else {
          lines.push(`  📄 ${sub}`);
        }
      }
      if (secondLevel.size > 20) {
        lines.push(`  ... and ${secondLevel.size - 20} more`);
      }
    } else {
      lines.push(`📄 ${entry}`);
    }
  }

  return lines.join("\n");
}
