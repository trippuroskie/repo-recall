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

const MAX_ITERATIONS = 20;
const EXPLORATION_MODEL = process.env.AGENT_EXPLORATION_MODEL || "anthropic/claude-haiku-3.5-20241022";
const SYNTHESIS_MODEL = process.env.AGENT_SYNTHESIS_MODEL || "anthropic/claude-sonnet-4";

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

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
    });

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
        content: toolResult.result.slice(0, 8000), // cap per-result size
      });
    }
  }

  // Phase 2: Synthesis
  emit({ type: "progress", phase: "Synthesizing findings", current: 2, total: 3 });

  // Gather the exploration summary — either the final assistant message or a compiled summary
  const lastAssistantMsg = messages
    .filter((m) => m.role === "assistant" && typeof m.content === "string" && m.content.length > 50)
    .pop();

  const explorationSummary = lastAssistantMsg?.content || buildFallbackSummary(toolResults);

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

  emit({ type: "progress", phase: "Complete", current: 3, total: 3 });
  emit({ type: "complete", brief });

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

Produce the structured JSON analysis now.`,
    },
  ];

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
  });

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

  // Parse codemap if present
  if (codemapRaw) {
    try {
      brief.codemap = parseCodemap(codemapRaw);
    } catch {
      // Skip codemap if it doesn't parse
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
