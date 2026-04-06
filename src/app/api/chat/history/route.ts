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

    // Get all sessions for the user with message stats
    const { data: sessions, error: sessionsError } = await supabase
      .from("chat_sessions")
      .select("id, brief_id, title, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (sessionsError) {
      return NextResponse.json({ error: "Failed to fetch chat history" }, { status: 500 });
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ conversations: [] });
    }

    // Get message counts and last message per session
    const sessionIds = sessions.map((s) => s.id);
    const { data: messages } = await supabase
      .from("chat_messages")
      .select("session_id, content, role, timestamp")
      .in("session_id", sessionIds)
      .order("timestamp", { ascending: false });

    const sessionStats = new Map<
      string,
      { lastMessage: string; lastRole: string; lastTimestamp: string; messageCount: number }
    >();

    for (const msg of messages || []) {
      const existing = sessionStats.get(msg.session_id);
      if (!existing) {
        sessionStats.set(msg.session_id, {
          lastMessage: msg.content,
          lastRole: msg.role,
          lastTimestamp: msg.timestamp,
          messageCount: 1,
        });
      } else {
        existing.messageCount++;
      }
    }

    // Get brief info for all unique brief IDs
    const briefIds = [...new Set(sessions.map((s) => s.brief_id))];
    const { data: briefs } = await supabase
      .from("briefs")
      .select("id, repo_full_name, repo_info")
      .in("id", briefIds);

    const briefMap = new Map(briefs?.map((b) => [b.id, b]) || []);

    // Build conversations grouped by repo
    const conversations = sessions
      .filter((s) => sessionStats.has(s.id)) // Only sessions with messages
      .map((s) => {
        const brief = briefMap.get(s.brief_id);
        const repoInfo = brief?.repo_info as Record<string, unknown> | undefined;
        const stats = sessionStats.get(s.id)!;
        return {
          sessionId: s.id,
          briefId: s.brief_id,
          title: s.title,
          repoFullName: brief?.repo_full_name ?? "Unknown",
          repoName: (repoInfo?.name as string) ?? brief?.repo_full_name?.split("/")[1] ?? "Unknown",
          repoOwner: (repoInfo?.owner as string) ?? brief?.repo_full_name?.split("/")[0] ?? "",
          lastMessage: stats.lastMessage,
          lastRole: stats.lastRole,
          lastTimestamp: stats.lastTimestamp,
          messageCount: stats.messageCount,
          createdAt: s.created_at,
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
