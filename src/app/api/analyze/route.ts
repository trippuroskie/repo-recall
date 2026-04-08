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
import { runAgenticAnalysis, type ProgressEvent } from "@/lib/agent/orchestrator";
import { saveBrief, trackUsage, rollbackUsage, getGitHubToken, getBriefByRepo } from "@/lib/store";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { checkPlanLimits } from "@/lib/plans";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const maxDuration = 300; // 5 minutes — max allowed on Vercel hobby plan

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const rl = checkRateLimit(user.id, "analyze");
    if (rl.limited) return rateLimitResponse(rl.retryAfter!);

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

    const { repoUrl, token, force } = await request.json();

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

    // Check for existing brief (skip if user explicitly wants to re-analyze)
    if (!force) {
      const existing = await getBriefByRepo(user.id, `${owner}/${repo}`);
      if (existing) {
        return NextResponse.json(
          {
            existing: true,
            brief: existing,
          },
          { status: 200 }
        );
      }
    }
    // Use provided token, or user's stored GitHub token, or server fallback
    const storedToken = await getGitHubToken(user.id);
    const authToken = token || storedToken || undefined;

    // If user provided a new token, save it to their profile for future use
    if (token && token !== storedToken) {
      const supabase = await createServiceClient();
      await supabase
        .from("profiles")
        .update({ github_access_token: token })
        .eq("id", user.id);
    }

    // Fetch repo info first to check private-repo entitlement
    const repoInfo = await fetchRepoInfo(owner, repo, authToken);

    if (repoInfo.isPrivate && !limits.canAccessPrivateRepos) {
      return NextResponse.json(
        {
          error:
            "Private repo analysis requires a Pro plan. Upgrade to analyze private repositories.",
          code: "PLAN_LIMIT_EXCEEDED",
        },
        { status: 403 }
      );
    }

    // Reserve usage quota before doing expensive work
    const usageId = await trackUsage(user.id, "analyze", `${owner}/${repo}`);
    const userId = user.id;

    // Set up SSE streaming
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Keepalive heartbeat to prevent Vercel/CDN/browser from closing idle connections
        const keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: keepalive\n\n`));
          } catch {
            clearInterval(keepalive);
          }
        }, 15_000);

        const send = (event: ProgressEvent) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          } catch {
            // Controller may be closed
          }
        };

        try {
          // Fetch base data in parallel
          send({ type: "progress", phase: "Fetching repository data", current: 0, total: 3 });

          const [files, prs, commits] = await Promise.all([
            fetchRepoTree(owner, repo, authToken),
            fetchPRs(owner, repo, authToken),
            fetchCommits(owner, repo, authToken),
          ]);

          const [packageJson, readme] = await Promise.all([
            fetchFileContent(owner, repo, "package.json", authToken),
            fetchFileContent(owner, repo, "README.md", authToken),
          ]);

          // Try agentic analysis first, fall back to static
          let brief;
          try {
            brief = await runAgenticAnalysis({
              repoInfo,
              files,
              prs,
              commits,
              packageJson,
              readme,
              token: authToken,
              onProgress: send,
            });
          } catch (agentError) {
            console.error("Agentic analysis failed, falling back to static:", agentError);
            send({
              type: "error",
              message: "Agentic analysis failed. Using static analysis as fallback.",
            });
            brief = generateBrief(repoInfo, files, prs, commits, packageJson, readme);
          }

          // Save to database
          await saveBrief(brief, userId);

          send({ type: "complete", brief });
          clearInterval(keepalive);
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (innerError) {
          clearInterval(keepalive);
          // Roll back usage reservation on failure
          if (usageId) await rollbackUsage(usageId);
          const message =
            innerError instanceof Error ? innerError.message : "Analysis failed";
          send({ type: "error", message });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
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
