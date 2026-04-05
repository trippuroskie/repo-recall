import { NextRequest } from "next/server";
import { getBrief, addChatMessage, trackUsage } from "@/lib/store";
import { buildBriefContext, CHAT_SYSTEM_PROMPT } from "@/lib/prompts";
import { requireAuth } from "@/lib/auth";
import { checkPlanLimits } from "@/lib/plans";
import type { ChatMessage } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

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

    const { briefId, messages } = (await request.json()) as {
      briefId: string;
      messages: { role: "user" | "assistant"; content: string }[];
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
    const systemMessage = `${CHAT_SYSTEM_PROMPT}\n\n---\n\nHere is the analyzed brief for the repository:\n\n${briefContext}`;

    // Save the user message
    const userMsg = messages[messages.length - 1];
    const userChatMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMsg.content,
      timestamp: new Date().toISOString(),
    };
    await addChatMessage(briefId, userChatMessage, user.id);

    const response = await fetch(
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
          model: "anthropic/claude-sonnet-4",
          stream: true,
          messages: [
            { role: "system", content: systemMessage },
            ...messages,
          ],
        }),
      }
    );

    if (!response.ok) {
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
          await addChatMessage(currentBriefId, assistantMessage, userId);

          // Track usage
          await trackUsage(userId, "chat_message");

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
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
