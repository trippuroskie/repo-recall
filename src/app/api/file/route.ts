import { NextRequest, NextResponse } from "next/server";
import { fetchFileContent } from "@/lib/github";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const path = searchParams.get("path");
  const token = searchParams.get("token");

  if (!owner || !repo || !path) {
    return NextResponse.json(
      { error: "owner, repo, and path are required" },
      { status: 400 }
    );
  }

  const content = await fetchFileContent(owner, repo, path, token || undefined);

  if (content === null) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return NextResponse.json({ content, path });
}
