import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET() {
  try {
    const user = await requireAuth();
    const rl = checkRateLimit(user.id, "standard");
    if (rl.limited) return rateLimitResponse(rl.retryAfter!);
    const supabase = await createServiceClient();

    const { data } = await supabase
      .from("profiles")
      .select("github_access_token")
      .eq("id", user.id)
      .single();

    const hasToken = !!data?.github_access_token;
    // Return masked version if token exists
    const masked = hasToken
      ? `ghp_${"*".repeat(20)}${data!.github_access_token!.slice(-4)}`
      : null;

    return NextResponse.json({ hasToken, masked });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth();
    const rl = checkRateLimit(user.id, "standard");
    if (rl.limited) return rateLimitResponse(rl.retryAfter!);
    const { token } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();
    const { error } = await supabase
      .from("profiles")
      .update({ github_access_token: token })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await requireAuth();
    const rl = checkRateLimit(user.id, "standard");
    if (rl.limited) return rateLimitResponse(rl.retryAfter!);
    const supabase = await createServiceClient();

    const { error } = await supabase
      .from("profiles")
      .update({ github_access_token: null })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
