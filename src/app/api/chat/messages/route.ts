import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getChatMessages } from "@/lib/store";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const briefId = request.nextUrl.searchParams.get("briefId");
    if (!briefId) {
      return NextResponse.json({ error: "briefId is required" }, { status: 400 });
    }

    const messages = await getChatMessages(briefId);
    return NextResponse.json({ messages });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
