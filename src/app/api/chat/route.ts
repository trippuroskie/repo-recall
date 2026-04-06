import { NextRequest } from "next/server";
import { getBrief, addChatMessage, trackUsage, rollbackUsage, getGitHubToken } from "@/lib/store";
import { buildBriefContext, CHAT_SYSTEM_PROMPT } from "@/lib/prompts";
import { requireAuth } from "@/lib/auth";
import { checkPlanLimits } from "@/lib/plans";
import { fetchFileContent } from "@/lib/github";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import type { ChatMessage, ProjectBrief } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const rl = checkRateLimit(user.id, "chat");
    if (rl.limited) return rateLimitResponse(rl.retryAfter!);

    // Check plan limits
    const limits = await checkPlanLimits(user.id);
    if (!limits.canChat) {
      return new Response(
        JSON.stringify({
          error: `You've used all ${limits.chatLimit} chat messages this month. Upgrade to Pro for unlimited chat.`,
          code: "PLAN_LIMIT_EXCEEDED",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const { briefId, sessionId, messages, mode } = (await request.json()) as {
      briefId: string;
      sessionId?: string;
      messages: { role: "user" | "assistant"; content: string }[];
      mode?: "fast" | "deep";
    };

    if (!briefId || !messages?.length) {
      return new Response(
        JSON.stringify({ error: "briefId and messages are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const brief = await getBrief(briefId);
    if (!brief) {
      return new Response(JSON.stringify({ error: "Brief not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const briefContext = buildBriefContext(brief);

    // Fetch relevant file contents so the model can reference specific lines
    const userQuery = messages[messages.length - 1]?.content || "";
    const isDeep = mode === "deep";
    const relevantFiles = selectRelevantFiles(brief, userQuery, isDeep ? 10 : 5);
    let fileContext = "";
    if (relevantFiles.length > 0) {
      const token = (await getGitHubToken(user.id)) || undefined;
      const fetched = await fetchRelevantFiles(
        brief.repoInfo.owner,
        brief.repoInfo.name,
        relevantFiles,
        token,
        isDeep ? 60_000 : 30_000
      );
      if (fetched.length > 0) {
        fileContext = "\n\n---\n\n## Source Files (with line numbers)\nUse these to reference specific code lines with [[file:path:line]] syntax.\n\n";
        fileContext += fetched
          .map(({ path, content }) => {
            const numbered = content
              .split("\n")
              .map((line, i) => `${i + 1}: ${line}`)
              .join("\n");
            return `### ${path}\n\`\`\`\n${numbered}\n\`\`\``;
          })
          .join("\n\n");
      }
    }

    const systemMessage = `${CHAT_SYSTEM_PROMPT}\n\n---\n\nHere is the analyzed brief for the repository:\n\n${briefContext}${fileContext}`;

    // Save the user message
    const userMsg = messages[messages.length - 1];
    const userChatMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMsg.content,
      timestamp: new Date().toISOString(),
    };
    await addChatMessage(briefId, userChatMessage, user.id, sessionId);

    // Reserve chat usage quota before the expensive AI call
    const usageId = await trackUsage(user.id, "chat_message");

    // Abort upstream request after 60 seconds to prevent hung connections
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    let response: Response;
    try {
      response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://reporecall.dev",
            "X-Title": "RepoRecall",
          },
          body: JSON.stringify({
            model: isDeep
              ? (process.env.CHAT_MODEL_DEEP || "google/gemini-2.5-pro-preview")
              : (process.env.CHAT_MODEL || "google/gemini-3-flash-preview"),
            stream: true,
            messages: [
              { role: "system", content: systemMessage },
              ...messages,
            ],
          }),
          signal: controller.signal,
        }
      );
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (usageId) await rollbackUsage(usageId);
      const isAbort =
        fetchErr instanceof Error && fetchErr.name === "AbortError";
      return new Response(
        JSON.stringify({
          error: isAbort
            ? "Request timed out. Please try again."
            : "Failed to connect to AI service",
        }),
        { status: isAbort ? 504 : 502, headers: { "Content-Type": "application/json" } }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      // Roll back usage reservation on upstream failure
      if (usageId) await rollbackUsage(usageId);
      const errorText = await response.text();
      console.error("OpenRouter error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to get response from AI" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // Stream the response through to the client
    const encoder = new TextEncoder();
    let fullContent = "";
    const userId = user.id;
    const currentBriefId = briefId;
    const currentSessionId = sessionId;

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  fullContent += delta;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ content: delta })}\n\n`
                    )
                  );
                }
              } catch {
                // Skip malformed JSON chunks
              }
            }
          }

          // Save the assistant message
          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: fullContent,
            timestamp: new Date().toISOString(),
          };
          await addChatMessage(currentBriefId, assistantMessage, userId, currentSessionId);

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          // Roll back usage reservation on stream failure
          if (usageId) await rollbackUsage(usageId);
          console.error("Stream error:", err);
          controller.error(err);
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
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("Chat error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// Check if a path looks like a file (has an extension)
function looksLikeFile(path: string): boolean {
  const lastSegment = path.split("/").pop() || "";
  return lastSegment.includes(".");
}

// Collect all known file paths from the brief, scored by relevance to the query
function selectRelevantFiles(brief: ProjectBrief, query: string, limit = 5): string[] {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

  const scored: { path: string; score: number }[] = [];
  const seen = new Set<string>();

  const addFile = (path: string, baseScore: number, context: string) => {
    if (!looksLikeFile(path) || seen.has(path)) return;
    seen.add(path);
    let score = baseScore;
    // Boost if the file path or context matches query words
    const pathLower = path.toLowerCase();
    const contextLower = context.toLowerCase();
    for (const word of queryWords) {
      if (pathLower.includes(word)) score += 3;
      if (contextLower.includes(word)) score += 2;
    }
    scored.push({ path, score });
  };

  // Entrypoints (high priority)
  for (const ep of brief.entrypoints) {
    const priority = ep.priority === "high" ? 2 : ep.priority === "medium" ? 1 : 0;
    addFile(ep.path, priority, ep.reason);
  }

  // Feature files
  for (const feature of brief.features) {
    const context = `${feature.name} ${feature.description} ${feature.businessPurpose}`;
    for (const file of feature.files) {
      addFile(file, 1, context);
    }
  }

  // Key modules
  for (const mod of brief.architecture.keyModules) {
    addFile(mod.path, 1, `${mod.name} ${mod.purpose}`);
  }

  // Sort by score descending, take top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.path);
}

// Fetch file contents in parallel, with a total size cap
async function fetchRelevantFiles(
  owner: string,
  repo: string,
  paths: string[],
  token?: string,
  maxTotalChars = 30_000
): Promise<{ path: string; content: string }[]> {
  const MAX_TOTAL_CHARS = maxTotalChars;
  const MAX_FILE_CHARS = 10_000;

  const results = await Promise.allSettled(
    paths.map(async (path) => {
      const content = await fetchFileContent(owner, repo, path, token);
      return content ? { path, content } : null;
    })
  );

  const files: { path: string; content: string }[] = [];
  let totalChars = 0;

  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value) continue;
    let { path, content } = result.value;
    if (content.length > MAX_FILE_CHARS) {
      content = content.slice(0, MAX_FILE_CHARS) + "\n... (truncated)";
    }
    if (totalChars + content.length > MAX_TOTAL_CHARS) break;
    totalChars += content.length;
    files.push({ path, content });
  }

  return files;
}
