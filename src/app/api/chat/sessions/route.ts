import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createChatSession, getChatSessionsForBrief, deleteChatSession, updateChatSessionTitle } from "@/lib/store";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// GET /api/chat/sessions?briefId=xxx — list sessions for a brief
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const rl = checkRateLimit(user.id, "standard");
    if (rl.limited) return rateLimitResponse(rl.retryAfter!);

    const briefId = request.nextUrl.searchParams.get("briefId");
    if (!briefId) {
      return NextResponse.json({ error: "briefId is required" }, { status: 400 });
    }

    const sessions = await getChatSessionsForBrief(briefId);
    return NextResponse.json({ sessions });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/chat/sessions — create a new session
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const rl = checkRateLimit(user.id, "standard");
    if (rl.limited) return rateLimitResponse(rl.retryAfter!);

    const { briefId, title } = (await request.json()) as { briefId: string; title?: string };
    if (!briefId) {
      return NextResponse.json({ error: "briefId is required" }, { status: 400 });
    }

    const sessionId = await createChatSession(briefId, user.id, title);
    return NextResponse.json({ sessionId });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/chat/sessions?sessionId=xxx — delete a session
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth();
    const rl = checkRateLimit(user.id, "standard");
    if (rl.limited) return rateLimitResponse(rl.retryAfter!);

    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    await deleteChatSession(sessionId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/chat/sessions — update session title
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth();
    const rl = checkRateLimit(user.id, "standard");
    if (rl.limited) return rateLimitResponse(rl.retryAfter!);

    const { sessionId, title } = (await request.json()) as { sessionId: string; title: string };
    if (!sessionId || !title) {
      return NextResponse.json({ error: "sessionId and title are required" }, { status: 400 });
    }

    await updateChatSessionTitle(sessionId, title);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
