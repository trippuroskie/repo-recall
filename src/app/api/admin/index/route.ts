import { NextRequest, NextResponse } from "next/server";
import {
  fetchRepoInfo,
  fetchRepoTree,
  fetchPRs,
  fetchCommits,
  fetchFileContent,
  parseRepoUrl,
} from "@/lib/github";
import { runAgenticAnalysis } from "@/lib/agent/orchestrator";
import { generateBrief } from "@/lib/analysis";
import { savePublicBrief } from "@/lib/store";

export const maxDuration = 300;

const SEED_REPOS = [
  "langchain-ai/langchain",
  "huggingface/transformers",
  "openai/codex",
  "All-Hands-AI/OpenHands",
  "block/goose",
  "anthropics/anthropic-cookbook",
  "vercel/ai",
  "ollama/ollama",
];

export async function POST(request: NextRequest) {
  try {
    // Validate admin secret
    const authHeader = request.headers.get("authorization");
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret) {
      return NextResponse.json(
        { error: "ADMIN_SECRET not configured" },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${adminSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const repos: string[] = body.repos || SEED_REPOS;
    const featured: boolean = body.featured !== false; // default true — all admin-indexed repos are featured unless explicitly opted out

    const token = process.env.GITHUB_TOKEN;
    const results: { repo: string; status: string; error?: string }[] = [];

    // Process repos sequentially (MVP — slow but simple)
    for (const repoStr of repos) {
      const parsed = parseRepoUrl(repoStr);
      if (!parsed) {
        results.push({ repo: repoStr, status: "error", error: "Invalid repo format" });
        continue;
      }

      const { owner, repo } = parsed;
      const isFeatured = featured;

      try {
        console.log(`[admin/index] Indexing ${owner}/${repo}...`);

        const repoInfo = await fetchRepoInfo(owner, repo, token);
        const [files, prs, commits] = await Promise.all([
          fetchRepoTree(owner, repo, token),
          fetchPRs(owner, repo, token),
          fetchCommits(owner, repo, token),
        ]);
        const [packageJson, readme] = await Promise.all([
          fetchFileContent(owner, repo, "package.json", token),
          fetchFileContent(owner, repo, "README.md", token),
        ]);

        let brief;
        try {
          brief = await runAgenticAnalysis({
            repoInfo,
            files,
            prs,
            commits,
            packageJson,
            readme,
            token,
            onProgress: () => {},
          });
        } catch (agentError) {
          console.error(`[admin/index] Agentic analysis failed for ${owner}/${repo}, falling back:`, agentError);
          brief = generateBrief(repoInfo, files, prs, commits, packageJson, readme);
        }

        // Generate deterministic public brief ID
        brief.id = `public-${owner}-${repo}`;

        await savePublicBrief(brief, repoInfo, isFeatured);

        console.log(`[admin/index] Indexed ${owner}/${repo} successfully`);
        results.push({ repo: `${owner}/${repo}`, status: "success" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[admin/index] Failed to index ${owner}/${repo}:`, message);
        results.push({ repo: `${owner}/${repo}`, status: "error", error: message });
      }
    }

    return NextResponse.json({ results }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indexing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
