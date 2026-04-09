import { NextRequest, NextResponse } from "next/server";
import { getPublicBrief } from "@/lib/store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  try {
    const { owner, repo } = await params;
    const repoFullName = `${owner}/${repo}`;
    const brief = await getPublicBrief(repoFullName);

    if (!brief) {
      return NextResponse.json(
        { error: "Public brief not found for this repository" },
        { status: 404 }
      );
    }

    return NextResponse.json({ brief });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch public brief";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
