// Agent orchestrator: manages the LLM exploration loop

import type {
  FileNode,
  RepoInfo,
  PRSummary,
  CommitSummary,
  ProjectBrief,
  Codemap,
  CodemapNode,
  Citation,
  FeatureMapping,
  TimelineData,
} from "../types";
import { ToolExecutor, type ExecutorConfig } from "./executor";
import { AGENT_TOOLS, type AgentToolCall, type ToolResult } from "./tools";
import { buildExplorationPrompt, SYNTHESIS_PROMPT } from "./prompts";
import { generateBrief } from "../analysis";

// Progress events emitted during analysis
export type ProgressEvent =
  | { type: "step"; action: string; detail: string; status: "started" | "done" }
  | { type: "finding"; category: string; summary: string }
  | { type: "progress"; phase: string; current: number; total: number }
  | { type: "complete"; brief: ProjectBrief }
  | { type: "error"; message: string };

export type ProgressCallback = (event: ProgressEvent) => void;

interface OrchestratorConfig {
  repoInfo: RepoInfo;
  files: FileNode[];
  prs: PRSummary[];
  commits: CommitSummary[];
  packageJson: string | null;
  readme: string | null;
  token?: string;
  onProgress?: ProgressCallback;
}

const MAX_ITERATIONS = 35;
const EXPLORATION_MODEL = process.env.AGENT_EXPLORATION_MODEL || "google/gemini-3-flash-preview";
const SYNTHESIS_MODEL = process.env.AGENT_SYNTHESIS_MODEL || "google/gemini-3.1-pro-preview";

export async function runAgenticAnalysis(config: OrchestratorConfig): Promise<ProjectBrief> {
  const { repoInfo, files, prs, commits, packageJson, readme, token, onProgress } = config;
  const emit = onProgress || (() => {});

  const executor = new ToolExecutor({
    owner: repoInfo.owner,
    repo: repoInfo.name,
    token,
    fileTree: files,
  });

  // Phase 1: Exploration
  emit({ type: "progress", phase: "Exploring codebase", current: 1, total: 3 });

  const explorationPrompt = buildExplorationPrompt(repoInfo, files, readme, packageJson);
  const toolResults: ToolResult[] = [];

  // Conversation history for the agent loop
  const messages: { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; name?: string }[] = [
    { role: "system", content: explorationPrompt },
    { role: "user", content: "Begin exploring this codebase. Start by identifying the main entry points and architecture." },
  ];

  let iteration = 0;
  let explorationFinished = false;

  while (iteration < MAX_ITERATIONS && !explorationFinished) {
    iteration++;
    emit({
      type: "progress",
      phase: "Exploring codebase",
      current: iteration,
      total: MAX_ITERATIONS,
    });

    // Check API budget
    if (executor.budgetRemaining <= 2) {
      messages.push({
        role: "user",
        content: "API budget nearly exhausted. Please summarize your findings now. Do NOT call any more tools.",
      });
    }

    // Call exploration LLM
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

    const explorationAbort = new AbortController();
    const explorationTimeout = setTimeout(() => explorationAbort.abort(), 45_000);

    let response: Response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://reporecall.dev",
          "X-Title": "RepoRecall Agent",
        },
        body: JSON.stringify({
          model: EXPLORATION_MODEL,
          messages,
          tools: AGENT_TOOLS,
          tool_choice: "auto",
        }),
        signal: explorationAbort.signal,
      });
    } catch (fetchErr) {
      clearTimeout(explorationTimeout);
      // On timeout, stop exploring and proceed to synthesis with what we have
      if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
        emit({ type: "error", message: "Exploration call timed out. Proceeding to synthesis." });
        explorationFinished = true;
        continue;
      }
      throw fetchErr;
    } finally {
      clearTimeout(explorationTimeout);
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`LLM exploration call failed: ${err}`);
    }

    const result = await response.json();
    const choice = result.choices?.[0];
    if (!choice) throw new Error("No response from exploration LLM");

    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    // Check for tool calls
    const toolCalls = assistantMessage.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      // No tool calls — the LLM is done exploring
      explorationFinished = true;
      continue;
    }

    // Execute each tool call
    for (const tc of toolCalls) {
      const fn = tc.function;
      let params: Record<string, unknown>;
      try {
        params = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : fn.arguments;
      } catch {
        params = {};
      }

      const toolCall: AgentToolCall = {
        name: fn.name as AgentToolCall["name"],
        params: params as AgentToolCall["params"],
      } as AgentToolCall;

      emit({
        type: "step",
        action: fn.name,
        detail: fn.name === "readFile" || fn.name === "readFileLines"
          ? (params.path as string) || ""
          : fn.name === "searchCode"
            ? `"${params.query}"`
            : (params.path as string) || "",
        status: "started",
      });

      const toolResult = await executor.execute(toolCall);
      toolResults.push(toolResult);

      emit({
        type: "step",
        action: fn.name,
        detail: fn.name === "readFile" || fn.name === "readFileLines"
          ? (params.path as string) || ""
          : fn.name === "searchCode"
            ? `"${params.query}"`
            : (params.path as string) || "",
        status: "done",
      });

      // Feed result back to conversation
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: toolResult.result.slice(0, 12000), // cap per-result size
      });
    }
  }

  // Phase 2: Synthesis
  emit({ type: "progress", phase: "Synthesizing findings", current: 2, total: 3 });

  // Gather the exploration summary — prefer the final text message, but collect all assistant text
  const assistantTexts = messages
    .filter((m) => m.role === "assistant" && typeof m.content === "string" && m.content.length > 0)
    .map((m) => m.content as string);

  const explorationSummary = assistantTexts.length > 0
    ? assistantTexts.join("\n\n")
    : buildFallbackSummary(toolResults);

  const brief = await synthesize({
    repoInfo,
    files,
    prs,
    commits,
    packageJson,
    readme,
    explorationSummary,
    toolResults,
    emit,
  });

  // Phase 3: Generate AI milestone summaries and populate timelineData
  emit({ type: "progress", phase: "Generating timeline insights", current: 2.5, total: 3 });

  const mergedPRs = prs.filter((pr) => pr.mergedAt);
  const timelineData: TimelineData = {
    prs: mergedPRs,
    commits,
    milestones: brief.timeline,
  };

  try {
    const summaries = await generateMilestoneSummaries(brief.timeline, mergedPRs, commits);
    if (summaries) {
      timelineData.milestoneSummaries = summaries;
    }
  } catch {
    // Non-critical — proceed without AI summaries
  }

  brief.timelineData = timelineData;

  emit({ type: "progress", phase: "Complete", current: 3, total: 3 });

  return brief;
}

interface SynthesisInput {
  repoInfo: RepoInfo;
  files: FileNode[];
  prs: PRSummary[];
  commits: CommitSummary[];
  packageJson: string | null;
  readme: string | null;
  explorationSummary: string;
  toolResults: ToolResult[];
  emit: ProgressCallback;
}

async function synthesize(input: SynthesisInput): Promise<ProjectBrief> {
  const { repoInfo, files, prs, commits, packageJson, readme, explorationSummary, toolResults, emit } = input;

  // Build a summary of what was explored
  const readFiles = toolResults
    .filter((r) => (r.tool === "readFile" || r.tool === "readFileLines") && !r.error)
    .map((r) => r.params.path as string);

  const fileListStr = readFiles.length > 0
    ? `\n\nFiles explored (${readFiles.length}):\n${readFiles.map((f) => `- ${f}`).join("\n")}`
    : "";

  // Phase 3: Include key file contents for richer synthesis context
  const keyReads = toolResults
    .filter((r) => (r.tool === "readFile" || r.tool === "readFileLines") && !r.error && r.result.length > 0)
    .sort((a, b) => {
      const priority = (path: string) => {
        if (path.includes("package.json") || path.includes("tsconfig")) return 0;
        if (/app\/.*page\.(tsx?|jsx?)$/.test(path)) return 1;
        if (/app\/.*layout\.(tsx?|jsx?)$/.test(path)) return 1;
        if (/api\/.*route\.(tsx?|jsx?)$/.test(path)) return 2;
        if (path.includes("/lib/") || path.includes("/utils/")) return 3;
        return 4;
      };
      return priority(a.params.path as string) - priority(b.params.path as string);
    });

  let fileBudget = 30_000;
  const includedFiles: string[] = [];
  for (const r of keyReads) {
    const content = r.result;
    // Escape triple-backticks in file content to prevent breaking prompt fences
    const safeContent = content.replace(/```/g, "`\u200B``");
    if (safeContent.length <= fileBudget) {
      includedFiles.push(`### ${r.params.path}\n\`\`\`\n${safeContent}\n\`\`\``);
      fileBudget -= safeContent.length;
    }
    if (fileBudget <= 0) break;
  }
  const keyFilesSection = includedFiles.length > 0
    ? `\n\n## Key File Contents\n\n${includedFiles.join("\n\n")}`
    : "";

  // Include search results summary
  const searches = toolResults
    .filter((r) => r.tool === "searchCode" && !r.error)
    .map((r) => `- Search: "${r.params.query}" → ${r.result.split("\n")[0]}`);
  const searchSection = searches.length > 0
    ? `\n\n## Search Findings\n\n${searches.join("\n")}`
    : "";

  const synthMessages = [
    { role: "system" as const, content: SYNTHESIS_PROMPT },
    {
      role: "user" as const,
      content: `Repository: ${repoInfo.fullName} (${repoInfo.language || "Unknown"})
Description: ${repoInfo.description || "None"}
${repoInfo.topics.length > 0 ? `Topics: ${repoInfo.topics.join(", ")}` : ""}

## Exploration Findings

${explorationSummary}
${fileListStr}
${keyFilesSection}
${searchSection}

Produce the structured JSON analysis now.`,
    },
  ];

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const synthesisAbort = new AbortController();
  const synthesisTimeout = setTimeout(() => synthesisAbort.abort(), 60_000);

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://reporecall.dev",
        "X-Title": "RepoRecall Synthesis",
      },
      body: JSON.stringify({
        model: SYNTHESIS_MODEL,
        messages: synthMessages,
        temperature: 0.3,
      }),
      signal: synthesisAbort.signal,
    });
  } catch (fetchErr) {
    clearTimeout(synthesisTimeout);
    emit({ type: "error", message: "Synthesis timed out. Falling back to static analysis." });
    return generateBrief(repoInfo, files, prs, commits, packageJson, readme);
  } finally {
    clearTimeout(synthesisTimeout);
  }

  if (!response.ok) {
    // Fallback to static analysis on synthesis failure
    emit({ type: "error", message: "Synthesis LLM failed. Falling back to static analysis." });
    return generateBrief(repoInfo, files, prs, commits, packageJson, readme);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    emit({ type: "error", message: "Empty synthesis response. Falling back." });
    return generateBrief(repoInfo, files, prs, commits, packageJson, readme);
  }

  try {
    const parsed = parseJsonResponse(content);
    return buildBriefFromSynthesis(repoInfo, files, prs, commits, packageJson, parsed);
  } catch (err) {
    emit({
      type: "error",
      message: `Failed to parse synthesis output: ${err instanceof Error ? err.message : "unknown"}. Falling back.`,
    });
    return generateBrief(repoInfo, files, prs, commits, packageJson, readme);
  }
}

function parseJsonResponse(content: string): Record<string, unknown> {
  // Strip markdown code fences if present
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return JSON.parse(cleaned);
}

function buildBriefFromSynthesis(
  repoInfo: RepoInfo,
  files: FileNode[],
  prs: PRSummary[],
  commits: CommitSummary[],
  packageJson: string | null,
  data: Record<string, unknown>
): ProjectBrief {
  // Use static analysis as baseline for anything the LLM misses
  const staticBrief = generateBrief(repoInfo, files, prs, commits, packageJson, null);

  const overview = data.overview as Record<string, unknown> | undefined;
  const arch = data.architecture as Record<string, unknown> | undefined;
  const features = data.features as Record<string, unknown>[] | undefined;
  const biz = data.businessContext as Record<string, unknown> | undefined;
  const codemapRaw = data.codemap as Record<string, unknown> | undefined;

  const brief: ProjectBrief = {
    id: `${repoInfo.owner}-${repoInfo.name}-${Date.now()}`,
    repoInfo,
    generatedAt: new Date().toISOString(),

    overview: {
      summary: (overview?.summary as string) || staticBrief.overview.summary,
      likelyUser: (overview?.likelyUser as string) || staticBrief.overview.likelyUser,
      valueProposition: (overview?.valueProposition as string) || staticBrief.overview.valueProposition,
      majorFlows: (overview?.majorFlows as string[]) || staticBrief.overview.majorFlows,
      stats: staticBrief.overview.stats, // always use actual stats
    },

    architecture: {
      stack: (arch?.stack as string[]) || staticBrief.architecture.stack,
      dependencies: staticBrief.architecture.dependencies, // use parsed deps
      apis: (arch?.apis as string[]) || staticBrief.architecture.apis,
      integrations: (arch?.integrations as string[]) || staticBrief.architecture.integrations,
      summary: (arch?.summary as string) || staticBrief.architecture.summary,
      keyModules: (arch?.keyModules as { name: string; path: string; purpose: string }[]) || staticBrief.architecture.keyModules,
    },

    features: features
      ? features.map((f) => ({
          name: (f.name as string) || "Unknown",
          description: (f.description as string) || "",
          files: (f.files as string[]) || [],
          businessPurpose: (f.businessPurpose as string) || "",
          category: ((f.category as string) || "infrastructure") as FeatureMapping["category"],
        }))
      : staticBrief.features,

    businessContext: {
      targetUser: (biz?.targetUser as string) || staticBrief.businessContext.targetUser,
      businessModel: (biz?.businessModel as string) || staticBrief.businessContext.businessModel,
      valueProposition: (biz?.valueProposition as string) || staticBrief.businessContext.valueProposition,
      featureClassification: staticBrief.businessContext.featureClassification,
      isInferred: false,
    },

    timeline: staticBrief.timeline, // always from actual git data
    entrypoints: staticBrief.entrypoints,
  };

  // Populate timelineData with raw PR/commit data for visualizations
  brief.timelineData = {
    prs: prs.filter((pr) => pr.mergedAt),
    commits,
    milestones: brief.timeline,
  };

  // Parse codemap if present
  if (codemapRaw) {
    try {
      brief.codemap = parseCodemap(codemapRaw);
    } catch {
      // Skip codemap if it doesn't parse
    }
  }

  // Parse AI-generated diagrams if present
  const diagramsRaw = data.diagrams as Record<string, string> | undefined;
  if (diagramsRaw) {
    const diagrams: ProjectBrief["diagrams"] = {};
    // Anchored regex for full-string validation (must start with a mermaid keyword)
    const mermaidKeywordRe = /^\s*(graph\s+(TD|LR|TB|BT|RL)\b|sequenceDiagram|flowchart\s+(TD|LR|TB|BT|RL)\b|gantt|pie|classDiagram|stateDiagram(-v2)?|erDiagram)/i;
    // Unanchored regex for finding the first mermaid keyword anywhere in a string
    const mermaidKeywordAnywhereRe = /(graph\s+(TD|LR|TB|BT|RL)\b|sequenceDiagram|flowchart\s+(TD|LR|TB|BT|RL)\b|gantt|pie|classDiagram|stateDiagram(-v2)?|erDiagram)/i;
    const isValidMermaid = (v: unknown): v is string =>
      typeof v === "string" && mermaidKeywordRe.test(v);

    // Per-key type constraints: overview must be sequenceDiagram, architecture/stack must be graph
    const expectedTypeRe: Record<string, RegExp> = {
      overview: /^\s*sequenceDiagram/i,
      architecture: /^\s*(graph|flowchart)\s+(TD|LR|TB|BT|RL)\b/i,
      stack: /^\s*(graph|flowchart)\s+(TD|LR|TB|BT|RL)\b/i,
      dataFlow: /^\s*(flowchart)\s+(LR|TD|TB|BT|RL)\b/i,
      entityRelationship: /^\s*erDiagram/i,
    };

    // Strip markdown fences and leading prose that LLMs often add
    const cleanMermaid = (raw: unknown): string | null => {
      if (typeof raw !== "string" || !raw.trim()) return null;
      let cleaned = raw;
      // Remove ```mermaid ... ``` fences
      cleaned = cleaned.replace(/^```(?:mermaid)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
      // Remove any leading prose before the first mermaid keyword (unanchored search)
      const keywordMatch = cleaned.match(mermaidKeywordAnywhereRe);
      if (keywordMatch && keywordMatch.index !== undefined && keywordMatch.index > 0) {
        cleaned = cleaned.slice(keywordMatch.index);
      }
      cleaned = cleaned.trim();
      return cleaned || null;
    };

    for (const key of ["overview", "architecture", "stack", "dataFlow", "entityRelationship"] as const) {
      const cleaned = cleanMermaid(diagramsRaw[key]);
      if (cleaned && isValidMermaid(cleaned) && expectedTypeRe[key].test(cleaned)) {
        diagrams[key] = cleaned;
      } else if (diagramsRaw[key]) {
        console.warn(`[orchestrator] Diagram "${key}" failed validation. Raw (first 200 chars):`, String(diagramsRaw[key]).slice(0, 200));
      }
    }

    if (Object.keys(diagrams).length > 0) {
      brief.diagrams = diagrams;
    }
  }

  // Parse overview explanation if present
  const explanationRaw = data.overviewExplanation as Record<string, unknown> | undefined;
  if (explanationRaw) {
    try {
      const intro = (explanationRaw.introduction as string) || "";
      const stepsRaw = explanationRaw.steps as Record<string, unknown>[] | undefined;
      if (intro && Array.isArray(stepsRaw) && stepsRaw.length > 0) {
        brief.overviewExplanation = {
          introduction: intro,
          steps: stepsRaw
            .filter((s) => s.title && s.description)
            .map((s) => ({
              title: s.title as string,
              description: s.description as string,
              codeRefs: Array.isArray(s.codeRefs)
                ? (s.codeRefs as Record<string, unknown>[]).map((r) => ({
                    filePath: (r.filePath as string) || "",
                    line: typeof r.line === "number" ? r.line : undefined,
                    label: (r.label as string) || (r.filePath as string) || "",
                  }))
                : [],
            })),
        };
      }
    } catch {
      // Skip explanation if it doesn't parse
    }
  }

  return brief;
}

function parseCodemap(raw: Record<string, unknown>): Codemap {
  return {
    title: (raw.title as string) || "Codemap",
    summary: (raw.summary as string) || "",
    nodes: parseCodemapNodes(raw.nodes as Record<string, unknown>[]),
  };
}

function parseCodemapNodes(nodes: Record<string, unknown>[] | undefined): CodemapNode[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((n) => ({
    id: (n.id as string) || "",
    title: (n.title as string) || "",
    description: (n.description as string) || "",
    children: parseCodemapNodes(n.children as Record<string, unknown>[]),
    citations: parseCitations(n.citations as Record<string, unknown>[]),
    diagram: n.diagram as string | undefined,
  }));
}

function parseCitations(citations: Record<string, unknown>[] | undefined): Citation[] {
  if (!Array.isArray(citations)) return [];
  return citations.map((c) => ({
    id: (c.id as string) || "",
    filePath: (c.filePath as string) || "",
    startLine: c.startLine as number | undefined,
    endLine: c.endLine as number | undefined,
    snippet: c.snippet as string | undefined,
  }));
}

function buildFallbackSummary(toolResults: ToolResult[]): string {
  const sections: string[] = ["## Exploration Summary (compiled from tool results)\n"];

  const reads = toolResults.filter(
    (r) => (r.tool === "readFile" || r.tool === "readFileLines") && !r.error
  );
  const searches = toolResults.filter((r) => r.tool === "searchCode" && !r.error);

  if (reads.length > 0) {
    sections.push(`### Files Read (${reads.length})`);
    for (const r of reads.slice(0, 30)) {
      const preview = r.result.split("\n").slice(0, 5).join("\n");
      sections.push(`**${r.params.path}**:\n${preview}\n`);
    }
  }

  if (searches.length > 0) {
    sections.push(`### Searches Performed (${searches.length})`);
    for (const r of searches) {
      sections.push(`- Search: "${r.params.query}" → ${r.result.split("\n")[0]}`);
    }
  }

  return sections.join("\n");
}

async function generateMilestoneSummaries(
  milestones: ProjectBrief["timeline"],
  prs: PRSummary[],
  commits: CommitSummary[]
): Promise<Record<string, string> | null> {
  if (milestones.length === 0) return null;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  // Build compact context for the LLM
  const milestoneContext = milestones.slice(0, 12).map((ms) => {
    const relatedPRs = prs
      .filter((pr) => ms.prs.includes(pr.number))
      .map((pr) => `  - PR #${pr.number}: ${pr.title}${pr.body ? ` — ${pr.body.slice(0, 150)}` : ""}`);
    const monthCommits = commits.filter((c) => c.date.startsWith(ms.date));
    return `### ${ms.date} — ${ms.title} (theme: ${ms.theme})
${ms.description}
${relatedPRs.length > 0 ? `PRs:\n${relatedPRs.join("\n")}` : ""}
${monthCommits.length > 0 ? `${monthCommits.length} commits this period` : ""}`;
  }).join("\n\n");

  const prompt = `You are summarizing the evolution of a software project. For each milestone period below, write a concise 1-2 sentence narrative summary that captures the key changes and their significance. Focus on the "why" and impact, not just listing what changed.

${milestoneContext}

Respond with valid JSON: an object where keys are the date strings (e.g., "2024-03") and values are the summary strings. Only include dates from the milestones above.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://reporecall.dev",
        "X-Title": "RepoRecall Timeline",
      },
      body: JSON.stringify({
        model: EXPLORATION_MODEL,
        messages: [
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) return null;

    let cleaned = content.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }
    return JSON.parse(cleaned) as Record<string, string>;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
