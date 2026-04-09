import { NextRequest, NextResponse } from "next/server";
import { getAllPublicBriefs } from "@/lib/store";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const featured = searchParams.get("featured") === "true";
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const { briefs, total } = await getAllPublicBriefs({
      featured: featured || undefined,
      limit,
      offset,
    });

    return NextResponse.json({ briefs, total });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch public briefs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
