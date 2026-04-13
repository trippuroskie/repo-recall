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
import {
  buildExplorationPrompt,
  SYNTHESIS_PROMPT,
  GAP_ANALYSIS_PROMPT,
  buildCycle2ExplorationPrompt,
  type GapTarget,
} from "./prompts";
import { generateBrief } from "../analysis";
import { EmbeddingStore } from "./vectorSearch";
import { createServiceClient } from "../supabase/server";

// Progress events emitted during analysis
export type ProgressEvent =
  | { type: "step"; action: string; detail: string; status: "started" | "done" }
  | { type: "finding"; category: string; summary: string }
  | {
      type: "progress";
      phase: string;
      current: number;
      total: number;
      cycle?: number;
      totalCycles?: number;
    }
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
  depth?: "standard" | "deep";
}

const MAX_ITERATIONS = 35;
const CYCLE2_MAX_ITERATIONS = 20;
const CYCLE2_EXTRA_BUDGET = 80;
// Deep-mode deadline must fit inside the analyze route's `maxDuration = 300` on
// Vercel. We leave ~30s of headroom for synthesis + saveBrief after the last
// cycle so we don't get killed mid-write. If the route limit ever changes, bump
// this alongside it.
const DEEP_HARD_TIMEOUT_MS = 270 * 1000;
const EXPLORATION_MODEL = process.env.AGENT_EXPLORATION_MODEL || "google/gemini-3-flash-preview";
const SYNTHESIS_MODEL = process.env.AGENT_SYNTHESIS_MODEL || "google/gemini-3.1-pro-preview";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
};

export async function runAgenticAnalysis(config: OrchestratorConfig): Promise<ProjectBrief> {
  const depth = config.depth === "deep" ? "deep" : "standard";
  if (depth === "deep") return runDeepAnalysis(config);
  return runStandardAnalysis(config);
}

async function runStandardAnalysis(config: OrchestratorConfig): Promise<ProjectBrief> {
  const { repoInfo, files, prs, commits, packageJson, readme, token, onProgress } = config;
  const emit = onProgress || (() => {});

  const embeddingStore = await createAndSeedEmbeddingStore(
    repoInfo,
    files,
    readme,
    packageJson,
    commits,
    token,
    emit
  );

  const executor = new ToolExecutor({
    owner: repoInfo.owner,
    repo: repoInfo.name,
    token,
    fileTree: files,
    embeddingStore,
  });

  // Phase 1: Exploration
  emit({ type: "progress", phase: "Exploring codebase", current: 1, total: 3 });

  const explorationPrompt = buildExplorationPrompt(repoInfo, files, readme, packageJson);
  const messages: ChatMessage[] = [
    { role: "system", content: explorationPrompt },
    {
      role: "user",
      content:
        "Begin exploring this codebase. Start by identifying the main entry points and architecture.",
    },
  ];

  const { explorationSummary, toolResults } = await runExplorationCycle({
    executor,
    messages,
    emit,
    maxIterations: MAX_ITERATIONS,
    phaseLabel: "Exploring codebase",
  });

  // Phase 2: Synthesis
  emit({ type: "progress", phase: "Synthesizing findings", current: 2, total: 3 });

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

  brief.depth = "standard";
  if (commits[0]?.sha) brief.commitSha = commits[0].sha;

  await finalizeTimeline(brief, prs, commits, emit);

  emit({ type: "progress", phase: "Complete", current: 3, total: 3 });

  return brief;
}

async function runDeepAnalysis(config: OrchestratorConfig): Promise<ProjectBrief> {
  const { repoInfo, files, prs, commits, packageJson, readme, token, onProgress } = config;
  const emit = onProgress || (() => {});
  const deadline = Date.now() + DEEP_HARD_TIMEOUT_MS;

  const embeddingStore = await createAndSeedEmbeddingStore(
    repoInfo,
    files,
    readme,
    packageJson,
    commits,
    token,
    emit
  );

  const executor = new ToolExecutor({
    owner: repoInfo.owner,
    repo: repoInfo.name,
    token,
    fileTree: files,
    embeddingStore,
  });

  // --- Cycle 1: standard exploration ---
  emit({
    type: "progress",
    phase: "Cycle 1 of 2 — initial exploration",
    current: 1,
    total: 4,
    cycle: 1,
    totalCycles: 2,
  });

  const cycle1Messages: ChatMessage[] = [
    { role: "system", content: buildExplorationPrompt(repoInfo, files, readme, packageJson) },
    {
      role: "user",
      content:
        "Begin exploring this codebase. Start by identifying the main entry points and architecture.",
    },
  ];

  const cycle1 = await runExplorationCycle({
    executor,
    messages: cycle1Messages,
    emit,
    maxIterations: MAX_ITERATIONS,
    phaseLabel: "Cycle 1 of 2 — initial exploration",
    cycle: 1,
    totalCycles: 2,
    deadline,
  });

  const allToolResults: ToolResult[] = [...cycle1.toolResults];

  // --- Gap Analysis ---
  let gaps: GapTarget[] = [];
  if (Date.now() < deadline) {
    emit({
      type: "progress",
      phase: "Analyzing gaps",
      current: 2,
      total: 4,
      cycle: 1,
      totalCycles: 2,
    });
    try {
      gaps = await runGapAnalysis(repoInfo, cycle1.explorationSummary, allToolResults);
    } catch (err) {
      console.warn("[orchestrator] Gap analysis failed, skipping cycle 2:", err);
      gaps = [];
    }
  }

  // --- Cycle 2: targeted deep dive ---
  let cycle2Summary = "";
  let cycle2Ran = false;
  if (gaps.length > 0 && Date.now() < deadline) {
    emit({
      type: "progress",
      phase: `Cycle 2 of 2 — deep dive on ${gaps.length} gap${gaps.length === 1 ? "" : "s"}`,
      current: 3,
      total: 4,
      cycle: 2,
      totalCycles: 2,
    });

    // Extend the API budget so cycle 2 has fresh headroom without wiping cycle 1 history
    executor.extendBudget(CYCLE2_EXTRA_BUDGET);

    const cycle2Messages: ChatMessage[] = [
      {
        role: "system",
        content: buildCycle2ExplorationPrompt(
          repoInfo,
          files,
          readme,
          packageJson,
          cycle1.explorationSummary,
          gaps
        ),
      },
      {
        role: "user",
        content:
          "Begin cycle 2. Tackle the gap targets in order of importance. Be decisive — do not re-explore prior territory.",
      },
    ];

    const cycle2 = await runExplorationCycle({
      executor,
      messages: cycle2Messages,
      emit,
      maxIterations: CYCLE2_MAX_ITERATIONS,
      phaseLabel: "Cycle 2 of 2 — deep dive",
      cycle: 2,
      totalCycles: 2,
      deadline,
    });

    cycle2Summary = cycle2.explorationSummary;
    allToolResults.push(...cycle2.toolResults);
    cycle2Ran = true;
  }

  // --- Final Synthesis ---
  // Only report cycle: 2 when cycle 2 actually executed. If it was skipped
  // (gap analysis failed, no gaps, or deadline reached), the deep run
  // gracefully degraded to a single cycle and the UI should reflect that.
  const finalCycle = cycle2Ran ? 2 : 1;
  emit({
    type: "progress",
    phase: "Synthesizing findings",
    current: 4,
    total: 4,
    cycle: finalCycle,
    totalCycles: 2,
  });

  const mergedSummary = cycle2Summary
    ? `# Cycle 1 Findings\n\n${cycle1.explorationSummary}\n\n# Cycle 2 Findings (Gap-Targeted Deep Dive)\n\n${cycle2Summary}`
    : cycle1.explorationSummary;

  const brief = await synthesize({
    repoInfo,
    files,
    prs,
    commits,
    packageJson,
    readme,
    explorationSummary: mergedSummary,
    toolResults: allToolResults,
    emit,
  });

  brief.depth = "deep";
  if (commits[0]?.sha) brief.commitSha = commits[0].sha;

  await finalizeTimeline(brief, prs, commits, emit, {
    phase: "Generating timeline insights",
    current: 3.5,
    total: 4,
    cycle: finalCycle,
    totalCycles: 2,
  });

  emit({
    type: "progress",
    phase: "Complete",
    current: 4,
    total: 4,
    cycle: finalCycle,
    totalCycles: 2,
  });

  return brief;
}

// ---------------------------------------------------------------------------
// Exploration loop — shared between standard and deep modes
// ---------------------------------------------------------------------------

interface ExplorationCycleInput {
  executor: ToolExecutor;
  messages: ChatMessage[];
  emit: ProgressCallback;
  maxIterations: number;
  phaseLabel: string;
  cycle?: number;
  totalCycles?: number;
  /** Wall-clock deadline in ms since epoch. If reached, cycle ends early. */
  deadline?: number;
}

interface ExplorationCycleResult {
  explorationSummary: string;
  toolResults: ToolResult[];
}

async function runExplorationCycle(
  input: ExplorationCycleInput
): Promise<ExplorationCycleResult> {
  const { executor, messages, emit, maxIterations, phaseLabel, cycle, totalCycles, deadline } =
    input;
  const toolResults: ToolResult[] = [];
  let iteration = 0;
  let explorationFinished = false;

  while (iteration < maxIterations && !explorationFinished) {
    if (deadline && Date.now() >= deadline) {
      emit({ type: "error", message: "Hard timeout reached — wrapping up exploration." });
      break;
    }

    iteration++;
    emit({
      type: "progress",
      phase: phaseLabel,
      current: iteration,
      total: maxIterations,
      cycle,
      totalCycles,
    });

    // Check API budget
    if (executor.budgetRemaining <= 2) {
      messages.push({
        role: "user",
        content:
          "API budget nearly exhausted. Please summarize your findings now. Do NOT call any more tools.",
      });
    }

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

    const toolCalls = assistantMessage.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      explorationFinished = true;
      continue;
    }

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

      const stepDetail =
        fn.name === "readFile" || fn.name === "readFileLines"
          ? (params.path as string) || ""
          : fn.name === "searchCode" || fn.name === "searchSemantic"
            ? `"${params.query}"`
            : (params.path as string) || "";

      emit({ type: "step", action: fn.name, detail: stepDetail, status: "started" });

      const toolResult = await executor.execute(toolCall);
      toolResults.push(toolResult);

      emit({ type: "step", action: fn.name, detail: stepDetail, status: "done" });

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: toolResult.result.slice(0, 12000),
      });
    }
  }

  const assistantTexts = messages
    .filter((m) => m.role === "assistant" && typeof m.content === "string" && m.content.length > 0)
    .map((m) => m.content as string);

  const explorationSummary =
    assistantTexts.length > 0 ? assistantTexts.join("\n\n") : buildFallbackSummary(toolResults);

  return { explorationSummary, toolResults };
}

// ---------------------------------------------------------------------------
// Gap analysis — bridges cycle 1 and cycle 2 in deep research mode
// ---------------------------------------------------------------------------

async function runGapAnalysis(
  repoInfo: RepoInfo,
  cycle1Summary: string,
  toolResults: ToolResult[]
): Promise<GapTarget[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

  const reads = toolResults
    .filter((r) => (r.tool === "readFile" || r.tool === "readFileLines") && !r.error)
    .map((r) => r.params.path as string);
  const readsList = reads.length > 0
    ? `\n\nFiles already explored:\n${reads.slice(0, 60).map((p) => `- ${p}`).join("\n")}`
    : "";

  const summary = cycle1Summary.length > 8000 ? cycle1Summary.slice(0, 8000) + "\n...(truncated)" : cycle1Summary;

  const userContent = `Repository: ${repoInfo.fullName}

## Cycle 1 Findings
${summary}
${readsList}

Produce the gap-analysis JSON now.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://reporecall.dev",
        "X-Title": "RepoRecall GapAnalysis",
      },
      body: JSON.stringify({
        model: SYNTHESIS_MODEL,
        messages: [
          { role: "system", content: GAP_ANALYSIS_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    if (!response.ok) return [];
    const result = await response.json();
    const content: string | undefined = result.choices?.[0]?.message?.content;
    if (!content) return [];

    let cleaned = content.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    const parsed = JSON.parse(cleaned) as { gaps?: unknown };
    const gapsRaw = Array.isArray(parsed.gaps) ? (parsed.gaps as Record<string, unknown>[]) : [];

    const gaps: GapTarget[] = [];
    for (const g of gapsRaw) {
      const area = typeof g.area === "string" ? g.area.trim() : "";
      const missing = typeof g.missing === "string" ? g.missing.trim() : "";
      const investigationPlan =
        typeof g.investigationPlan === "string" ? g.investigationPlan.trim() : "";
      const questionsRaw = Array.isArray(g.questions) ? g.questions : [];
      const questions = questionsRaw
        .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
        .map((q) => q.trim());
      if (area && missing && investigationPlan && questions.length > 0) {
        gaps.push({ area, missing, investigationPlan, questions });
      }
      if (gaps.length >= 5) break;
    }

    return gaps;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Finalize timeline with AI milestone summaries (shared)
// ---------------------------------------------------------------------------

async function finalizeTimeline(
  brief: ProjectBrief,
  prs: PRSummary[],
  commits: CommitSummary[],
  emit: ProgressCallback,
  progress: {
    phase: string;
    current: number;
    total: number;
    cycle?: number;
    totalCycles?: number;
  } = { phase: "Generating timeline insights", current: 2.5, total: 3 }
): Promise<void> {
  emit({ type: "progress", ...progress });

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
}

// ---------------------------------------------------------------------------
// Embedding store initialization (shared)
// ---------------------------------------------------------------------------

async function createAndSeedEmbeddingStore(
  repoInfo: RepoInfo,
  files: FileNode[],
  readme: string | null,
  packageJson: string | null,
  commits: CommitSummary[],
  token: string | undefined,
  emit: ProgressCallback
): Promise<EmbeddingStore | undefined> {
  if (!process.env.OPENROUTER_API_KEY) return undefined;

  // Phase 6: wire up pgvector persistence when we have a commit SHA to key on
  // and Supabase service credentials available. If either is missing, fall
  // back to the original in-memory-only behavior.
  const commitSha = commits[0]?.sha;
  const hasServiceCreds =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  let supabase: Awaited<ReturnType<typeof createServiceClient>> | undefined;
  if (commitSha && hasServiceCreds) {
    try {
      supabase = await createServiceClient();
    } catch (err) {
      console.warn("[orchestrator] Could not create Supabase service client:", err);
    }
  }

  // Diagnostic: surface why persistence did or didn't engage. Remove once
  // Phase 6 is confirmed working end-to-end in the target environment.
  console.log("[orchestrator] embedding persistence?", {
    repoSlug: repoInfo.fullName,
    hasSha: !!commitSha,
    hasServiceCreds,
    hasClient: !!supabase,
  });

  let embeddingStore: EmbeddingStore | undefined = new EmbeddingStore({
    repoSlug: repoInfo.fullName,
    commitSha,
    supabase,
  });

  // Load any chunks previously embedded for this (repo, commit) so we skip
  // re-embedding the same content on reruns.
  let cachedCount = 0;
  if (supabase && commitSha) {
    try {
      cachedCount = await embeddingStore.loadFromDb();
    } catch (err) {
      console.warn("[orchestrator] loadFromDb failed, continuing:", err);
    }
  }

  emit({
    type: "step",
    action: "seedIndex",
    detail:
      cachedCount > 0
        ? `Loaded ${cachedCount} cached chunks; indexing remaining key files`
        : "Indexing key files for semantic search",
    status: "started",
  });
  let seedFailed = false;
  try {
    await seedEmbeddingStore(
      embeddingStore,
      repoInfo,
      files,
      readme,
      packageJson,
      commitSha,
      token
    );
  } catch (err) {
    console.warn(
      "[orchestrator] Embedding store seeding failed, continuing with whatever we have:",
      err
    );
    seedFailed = true;
    // Discard the store only if we also have no cached chunks to fall back
    // on — otherwise keep the loaded cache so semantic search still works
    // against the previously-embedded slice of the repo.
    if (embeddingStore.size === 0) {
      embeddingStore = undefined;
    }
  }
  if (embeddingStore) {
    const suffix = cachedCount > 0 ? ` (${cachedCount} from cache)` : "";
    emit({
      type: "step",
      action: "seedIndex",
      detail: seedFailed
        ? `Seeding partially failed; serving ${embeddingStore.size} chunks${suffix}`
        : `Indexed ${embeddingStore.size} chunks${suffix}`,
      status: "done",
    });
  }
  return embeddingStore;
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
      dataFlow: /^\s*flowchart\s+LR\b/i,
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

// ---------------------------------------------------------------------------
// Embedding store seeding — fetch and embed high-signal files before exploration
// ---------------------------------------------------------------------------

/** Patterns for identifying high-signal files from the file tree.
 *  Lower priority = embed first. Bumped from ~14 candidates to a much wider
 *  net so RAG-backed chat (initiative #1 of embeddings-next-steps.md) has
 *  meaningful retrieval surface for non-trivial questions. The total seed
 *  count is still bounded by SEED_FILE_LIMIT below. */
const HIGH_SIGNAL_PATTERNS: { re: RegExp; priority: number }[] = [
  // Entry points
  { re: /^(src\/)?(index|main|app|server)\.(ts|tsx|js|jsx|py|go|rs)$/, priority: 0 },
  { re: /^(src\/)?main\.(ts|js|py|go|rs)$/, priority: 0 },
  { re: /^cmd\/.*\/main\.go$/, priority: 0 },
  // Config files
  { re: /^(next|nuxt|vite|astro|svelte)\.config\.(ts|js|mjs)$/, priority: 1 },
  { re: /^tsconfig\.json$/, priority: 2 },
  // Route handlers / pages (App Router, Pages Router, API routes)
  { re: /^src\/app\/.*\/(page|layout|route)\.(ts|tsx|js|jsx)$/, priority: 2 },
  { re: /^(src\/)?pages\/.*\.(ts|tsx|js|jsx)$/, priority: 3 },
  { re: /^(src\/)?app\/api\/.*route\.(ts|js)$/, priority: 2 },
  // API/handler patterns common outside Next.js
  { re: /^(src\/)?(handlers|controllers|routes|endpoints|api)\/.+\.(ts|tsx|js|jsx|py|go|rs)$/, priority: 2 },
  // Core lib / utils — top-level files (priority 3)
  { re: /^(src\/)?(lib|utils|services|core|server)\/[^/]+\.(ts|tsx|js|jsx|py|go|rs)$/, priority: 3 },
  // Core lib / utils — one level deeper (priority 4 so they fill behind top-level)
  { re: /^(src\/)?(lib|utils|services|core|server)\/[^/]+\/[^/]+\.(ts|tsx|js|jsx|py|go|rs)$/, priority: 4 },
  // Schema / models / types
  { re: /^(src\/)?(types|models|schema|entities|domain)\.(ts|js|py)$/, priority: 2 },
  { re: /^(src\/)?(types|models|schema|entities|domain)\/[^/]+\.(ts|js|py)$/, priority: 3 },
  // Database migrations and schema files
  { re: /^(supabase\/migrations|prisma|migrations|db\/migrations)\/.+\.(sql|ts|js|prisma)$/, priority: 3 },
  { re: /^(prisma\/schema\.prisma|drizzle\.config\.(ts|js))$/, priority: 2 },
  // Hooks and providers (often hold app-wide state/auth/db wiring)
  { re: /^(src\/)?(hooks|providers|context|stores)\/[^/]+\.(ts|tsx|js|jsx)$/, priority: 4 },
];

/** Paths matching any of these are excluded regardless of pattern matches —
 *  they bloat the cache without helping retrieval quality. */
const SEED_EXCLUDE_RE = /(^|\/)(node_modules|dist|build|out|\.next|\.turbo|coverage|__tests__|__mocks__|fixtures|tests?|e2e|cypress|playwright)(\/|$)/;

/** Hard cap on seeded files. First-run cost scales linearly with this; reruns
 *  at the same commit pay nothing thanks to the pgvector cache (migration 009). */
const SEED_FILE_LIMIT = 40;

function selectHighSignalFiles(files: FileNode[], limit: number): string[] {
  const candidates: { path: string; priority: number; depth: number }[] = [];

  for (const file of files) {
    if (file.type !== "file") continue;
    if (SEED_EXCLUDE_RE.test(file.path)) continue;
    for (const pattern of HIGH_SIGNAL_PATTERNS) {
      if (pattern.re.test(file.path)) {
        candidates.push({
          path: file.path,
          priority: pattern.priority,
          depth: file.path.split("/").length,
        });
        break; // first match wins
      }
    }
  }

  // Sort by priority (lower = better), then by path depth (shallower = better)
  candidates.sort((a, b) => a.priority - b.priority || a.depth - b.depth);
  return candidates.slice(0, limit).map((c) => c.path);
}

async function seedEmbeddingStore(
  store: EmbeddingStore,
  repoInfo: RepoInfo,
  files: FileNode[],
  readme: string | null,
  packageJson: string | null,
  commitSha: string | undefined,
  token?: string
): Promise<void> {
  const docs: { path: string; content: string }[] = [];

  // Always index README and package.json if available
  if (readme) docs.push({ path: "README.md", content: readme });
  if (packageJson) docs.push({ path: "package.json", content: packageJson });

  // Select high-signal files from the tree (cap is bounded by SEED_FILE_LIMIT
  // rather than a magic number — first-run cost is linear in this).
  const highSignalPaths = selectHighSignalFiles(files, SEED_FILE_LIMIT);

  // Fetch content for high-signal files via GitHub API, pinned to the same
  // commit SHA used as the persistence key. If commitSha is missing, we fall
  // back to branch HEAD — accepted drift since there's no cache to taint.
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: token || process.env.GITHUB_TOKEN });

  const fetchPromises = highSignalPaths
    .filter((p) => !docs.some((d) => d.path === p)) // skip if already have content
    .map(async (path) => {
      try {
        const { data } = await octokit.repos.getContent({
          owner: repoInfo.owner,
          repo: repoInfo.name,
          path,
          ...(commitSha ? { ref: commitSha } : {}),
        });
        if ("content" in data && data.content) {
          const content = Buffer.from(data.content, "base64").toString("utf-8");
          // Skip very large files
          if (content.length <= 100_000) {
            return { path, content };
          }
        }
      } catch {
        // File not fetchable — skip
      }
      return null;
    });

  const fetched = await Promise.all(fetchPromises);
  for (const f of fetched) {
    if (f) docs.push(f);
  }

  if (docs.length > 0) {
    await store.addDocuments(docs);
  }
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
