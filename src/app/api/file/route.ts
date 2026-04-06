import { NextRequest, NextResponse } from "next/server";
import { fetchFileContent } from "@/lib/github";
import { getAuthUser } from "@/lib/auth";
import { getGitHubToken } from "@/lib/store";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const path = searchParams.get("path");

  if (!owner || !repo || !path) {
    return NextResponse.json(
      { error: "owner, repo, and path are required" },
      { status: 400 }
    );
  }

  let token: string | undefined;
  const user = await getAuthUser();
  if (user) {
    const rl = checkRateLimit(user.id, "standard");
    if (rl.limited) return rateLimitResponse(rl.retryAfter!);
    token = (await getGitHubToken(user.id)) || undefined;
  }

  const content = await fetchFileContent(owner, repo, path, token);

  if (content === null) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return NextResponse.json({ content, path });
}
