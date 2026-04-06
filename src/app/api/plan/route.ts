import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkPlanLimits } from "@/lib/plans";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET() {
  try {
    const user = await requireAuth();
    const rl = checkRateLimit(user.id, "standard");
    if (rl.limited) return rateLimitResponse(rl.retryAfter!);
    const limits = await checkPlanLimits(user.id);
    return NextResponse.json(limits);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to get plan info" },
      { status: 500 }
    );
  }
}
