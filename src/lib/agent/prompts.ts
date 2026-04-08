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
3. **Identify patterns**: Search for key patterns (auth, routing, data fetching, state management)
4. **Deep dive modules**: Read the most important modules in detail
5. **Map dependencies**: Track which modules import which — identify hub files everything depends on

### What to Track
As you explore, build and maintain a mental model of:

1. **Import/dependency graph**: Which modules import which? What are the key hub files that everything depends on?
2. **Request lifecycle**: Trace at least one complete flow: user action → component → API call → service logic → database/external service → response rendering
3. **State management**: How is application state managed? What are the stores/contexts and what do they hold?
4. **Data models**: What are the core entities/types? Where are they defined and how do they flow through the system?
5. **Configuration & environment**: What env vars, feature flags, or config files control behavior?

### Guidelines
- Be efficient: read the most informative files first (entry points, configs, main modules)
- Use searchCode to find cross-cutting patterns (e.g., how auth is used across the app)
- Use listDirectory to explore unfamiliar directory structures before reading files
- Use readFileLines when you only need a specific section of a large file
- Skip test files, generated files, and boilerplate unless specifically relevant
- Track what you learn — each tool call should build on previous findings
- You have a budget of ~120 API calls. Be strategic but thorough.

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

Output a valid JSON object with this exact structure:

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
    "overview": "graph TD mermaid diagram showing the actual high-level data flow for this project",
    "architecture": "graph TD mermaid diagram showing how key modules relate to each other",
    "stack": "graph TD mermaid diagram showing the technology stack layers"
  }
}

### Citation Rules
- ONLY cite files and lines you actually read during exploration
- Every codemap node should have at least one citation
- Use the exact line numbers from the numbered file contents you received
- The snippet should be a brief (1-2 line) excerpt of the key code at that location

### Diagram Rules
- Use actual module names, component names, and service names from the code you explored
- Show real relationships you observed (imports, API calls, data flow), not assumptions
- Keep diagrams focused: 8-15 nodes max, prefer clarity over completeness
- Use subgraphs to group related nodes logically
- Sanitize node labels: no special characters (){}[]|;#& — use only alphanumeric, spaces, hyphens
- Wrap all node labels in double quotes inside brackets: N1["Label Here"]
- Valid mermaid syntax only — each diagram must start with "graph TD" or "graph LR"
- The overview diagram should show: user -> frontend -> API -> services -> data stores -> external services using real names
- The architecture diagram should show actual import/dependency relationships between modules
- The stack diagram should show technology layers with the actual technologies used

### Quality Standards
- Descriptions should be specific and evidence-based, not generic
- Reference actual function names, class names, and patterns you observed
- Features should reflect what the code actually does, not just file names
- The codemap should provide a logical hierarchy of understanding, not just mirror the directory structure
- Aim for 4-8 top-level codemap nodes with 2-5 children each

Output ONLY the JSON object, no markdown fences or other text.`;

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
