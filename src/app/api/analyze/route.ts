import { NextRequest, NextResponse } from "next/server";
import {
  parseRepoUrl,
  fetchRepoInfo,
  fetchRepoTree,
  fetchPRs,
  fetchCommits,
  fetchFileContent,
} from "@/lib/github";
import { generateBrief } from "@/lib/analysis";
import { saveBrief, trackUsage, getGitHubToken } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { checkPlanLimits } from "@/lib/plans";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    // Check plan limits
    const limits = await checkPlanLimits(user.id);
    if (!limits.canAnalyze) {
      return NextResponse.json(
        {
          error: `You've used all ${limits.analyzesLimit} analyses this month. Upgrade to Pro for unlimited analyses.`,
          code: "PLAN_LIMIT_EXCEEDED",
        },
        { status: 403 }
      );
    }

    const { repoUrl, token } = await request.json();

    if (!repoUrl) {
      return NextResponse.json(
        { error: "Repository URL is required" },
        { status: 400 }
      );
    }

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid GitHub repository URL" },
        { status: 400 }
      );
    }

    const { owner, repo } = parsed;
    // Use provided token, or user's stored GitHub token, or server fallback
    const authToken =
      token || (await getGitHubToken(user.id)) || undefined;

    // Fetch all data in parallel
    const [repoInfo, files, prs, commits] = await Promise.all([
      fetchRepoInfo(owner, repo, authToken),
      fetchRepoTree(owner, repo, authToken),
      fetchPRs(owner, repo, authToken),
      fetchCommits(owner, repo, authToken),
    ]);

    // Fetch key files
    const [packageJson, readme] = await Promise.all([
      fetchFileContent(owner, repo, "package.json", authToken),
      fetchFileContent(owner, repo, "README.md", authToken),
    ]);

    // Generate the brief
    const brief = generateBrief(
      repoInfo,
      files,
      prs,
      commits,
      packageJson,
      readme
    );

    // Save to database
    await saveBrief(brief, user.id);

    // Track usage
    await trackUsage(user.id, "analyze", `${owner}/${repo}`);

    return NextResponse.json({ brief });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Analysis failed";

    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let status = 500;
    let userMessage = message;

    if (message.includes("Not Found")) {
      status = 404;
      userMessage =
        "Repository not found. Check the URL or add a personal access token for private repos.";
    } else if (
      message.includes("rate limit") ||
      message.includes("API rate limit")
    ) {
      status = 429;
      userMessage =
        "GitHub API rate limit exceeded. Add a personal access token to increase your limit (60 → 5,000 requests/hour).";
    } else if (message.includes("Bad credentials")) {
      status = 401;
      userMessage =
        "Invalid GitHub token. Please check your personal access token and try again.";
    } else if (
      message.includes("403") ||
      message.includes("Forbidden")
    ) {
      status = 403;
      userMessage =
        "Access denied. This may be a private repo — try adding a personal access token with repo scope.";
    } else if (
      message.includes("ETIMEDOUT") ||
      message.includes("ECONNREFUSED") ||
      message.includes("fetch failed")
    ) {
      status = 502;
      userMessage =
        "Could not connect to GitHub. Please check your network and try again.";
    }

    return NextResponse.json({ error: userMessage }, { status });
  }
}
