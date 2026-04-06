import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET() {
  try {
    const user = await requireAuth();
    const rl = checkRateLimit(user.id, "standard");
    if (rl.limited) return rateLimitResponse(rl.retryAfter!);
    const supabase = await createClient();

    // Get briefs that have chat messages, with latest message and count
    const { data: chatBriefs, error } = await supabase
      .from("chat_messages")
      .select("brief_id, content, role, timestamp")
      .eq("user_id", user.id)
      .order("timestamp", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch chat history" }, { status: 500 });
    }

    if (!chatBriefs || chatBriefs.length === 0) {
      return NextResponse.json({ conversations: [] });
    }

    // Group by brief_id: get latest message and count
    const briefMap = new Map<
      string,
      { briefId: string; lastMessage: string; lastRole: string; lastTimestamp: string; messageCount: number }
    >();

    for (const msg of chatBriefs) {
      const existing = briefMap.get(msg.brief_id);
      if (!existing) {
        briefMap.set(msg.brief_id, {
          briefId: msg.brief_id,
          lastMessage: msg.content,
          lastRole: msg.role,
          lastTimestamp: msg.timestamp,
          messageCount: 1,
        });
      } else {
        existing.messageCount++;
      }
    }

    // Fetch brief info for each
    const briefIds = Array.from(briefMap.keys());
    const { data: briefs } = await supabase
      .from("briefs")
      .select("id, repo_full_name, repo_info")
      .in("id", briefIds);

    const conversations = Array.from(briefMap.values()).map((conv) => {
      const brief = briefs?.find((b) => b.id === conv.briefId);
      const repoInfo = brief?.repo_info as Record<string, unknown> | undefined;
      return {
        briefId: conv.briefId,
        repoFullName: brief?.repo_full_name ?? "Unknown",
        repoName: (repoInfo?.name as string) ?? brief?.repo_full_name?.split("/")[1] ?? "Unknown",
        repoOwner: (repoInfo?.owner as string) ?? brief?.repo_full_name?.split("/")[0] ?? "",
        lastMessage: conv.lastMessage,
        lastRole: conv.lastRole,
        lastTimestamp: conv.lastTimestamp,
        messageCount: conv.messageCount,
      };
    });

    // Sort by most recent
    conversations.sort(
      (a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()
    );

    return NextResponse.json({ conversations });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
