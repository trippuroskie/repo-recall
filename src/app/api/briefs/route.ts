import { NextResponse } from "next/server";
import { getAllBriefs } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET() {
  try {
    const user = await requireAuth();
    const rl = checkRateLimit(user.id, "standard");
    if (rl.limited) return rateLimitResponse(rl.retryAfter!);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const briefs = await getAllBriefs();
  return NextResponse.json({ briefs });
}
