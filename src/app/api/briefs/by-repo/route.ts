import { NextRequest, NextResponse } from "next/server";
import { getBriefByRepo } from "@/lib/store";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const repo = request.nextUrl.searchParams.get("repo");

    if (!repo) {
      return NextResponse.json(
        { error: "repo query parameter is required" },
        { status: 400 }
      );
    }

    const brief = await getBriefByRepo(user.id, repo);
    if (!brief) {
      return NextResponse.json({ found: false }, { status: 404 });
    }

    return NextResponse.json({ found: true, brief });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
