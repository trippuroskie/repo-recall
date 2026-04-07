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
    const userQuery = messages[messages.length - 1]?.content || "";
    const isDeep = mode === "deep";

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

    // Stream the response — trace events are emitted during file fetching,
    // then AI content tokens are piped through.
    const encoder = new TextEncoder();
    const userId = user.id;
    const currentBriefId = briefId;
    const currentSessionId = sessionId;

    const stream = new ReadableStream({
      async start(streamController) {
        let fullContent = "";

        try {
          // --- Phase 1: File selection & fetching with trace events ---
          enqueueTrace(streamController, encoder, "select_files", "started", "Analyzing query...");
          const relevantFiles = selectRelevantFiles(brief, userQuery, isDeep ? 10 : 5);
          enqueueTrace(streamController, encoder, "select_files", "done", `Selected ${relevantFiles.length} files`, { files: relevantFiles });

          let fileContext = "";
          if (relevantFiles.length > 0) {
            enqueueTrace(streamController, encoder, "fetch_files", "started", `Reading ${relevantFiles.length} files...`);
            const token = (await getGitHubToken(userId)) || undefined;
            const fetched = await fetchRelevantFilesWithTrace(
              brief.repoInfo.owner,
              brief.repoInfo.name,
              relevantFiles,
              token,
              isDeep ? 60_000 : 30_000,
              streamController,
              encoder
            );
            enqueueTrace(streamController, encoder, "fetch_files", "done", `Read ${fetched.length} files`, { count: fetched.length });

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

          enqueueTrace(streamController, encoder, "build_context", "done", "Context ready");
          enqueueTrace(streamController, encoder, "thinking", "started", "Generating response...");

          const systemMessage = `${CHAT_SYSTEM_PROMPT}\n\n---\n\nHere is the analyzed brief for the repository:\n\n${briefContext}${fileContext}`;

          // --- Phase 2: Call OpenRouter and stream AI content ---
          const abortController = new AbortController();
          const timeout = setTimeout(() => abortController.abort(), 60_000);

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
                signal: abortController.signal,
              }
            );
          } catch (fetchErr) {
            clearTimeout(timeout);
            if (usageId) await rollbackUsage(usageId);
            const isAbort = fetchErr instanceof Error && fetchErr.name === "AbortError";
            streamController.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", message: isAbort ? "Request timed out. Please try again." : "Failed to connect to AI service" })}\n\n`)
            );
            streamController.enqueue(encoder.encode("data: [DONE]\n\n"));
            streamController.close();
            return;
          } finally {
            clearTimeout(timeout);
          }

          if (!response.ok) {
            if (usageId) await rollbackUsage(usageId);
            const errorText = await response.text();
            console.error("OpenRouter error:", errorText);
            streamController.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Failed to get response from AI" })}\n\n`)
            );
            streamController.enqueue(encoder.encode("data: [DONE]\n\n"));
            streamController.close();
            return;
          }

          // Pipe AI content tokens through
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

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
                  streamController.enqueue(
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

          streamController.enqueue(encoder.encode("data: [DONE]\n\n"));
          streamController.close();
        } catch (err) {
          if (usageId) await rollbackUsage(usageId);
          console.error("Stream error:", err);
          streamController.error(err);
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

// Emit a trace event into the SSE stream
function enqueueTrace(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  action: string,
  status: "started" | "done",
  detail: string,
  extra?: Record<string, unknown>
) {
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({ type: "trace", action, status, detail, ...extra })}\n\n`)
  );
}

// Fetch file contents with progressive trace events.
// Files are fetched in small concurrent batches so the client sees
// traces arrive progressively rather than all at once.
async function fetchRelevantFilesWithTrace(
  owner: string,
  repo: string,
  paths: string[],
  token: string | undefined,
  maxTotalChars = 30_000,
  streamController: ReadableStreamDefaultController,
  encoder: TextEncoder
): Promise<{ path: string; content: string }[]> {
  const MAX_TOTAL_CHARS = maxTotalChars;
  const MAX_FILE_CHARS = 10_000;
  const BATCH_SIZE = 3;

  const files: { path: string; content: string }[] = [];
  let totalChars = 0;

  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    if (totalChars >= MAX_TOTAL_CHARS) break;

    const batch = paths.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (path) => {
        const content = await fetchFileContent(owner, repo, path, token);
        return content ? { path, content } : null;
      })
    );

    for (const result of results) {
      if (result.status !== "fulfilled" || !result.value) continue;
      let { path, content } = result.value;
      if (content.length > MAX_FILE_CHARS) {
        content = content.slice(0, MAX_FILE_CHARS) + "\n... (truncated)";
      }
      if (totalChars + content.length > MAX_TOTAL_CHARS) break;
      totalChars += content.length;
      files.push({ path, content });
      enqueueTrace(streamController, encoder, "fetch_file", "done", path);
    }
  }

  return files;
}
