import { NextRequest, NextResponse } from "next/server";
import { parseRepoUrl, fetchRepoInfo, fetchRepoTree, fetchPRs, fetchCommits, fetchFileContent } from "@/lib/github";
import { generateBrief } from "@/lib/analysis";
import { saveBrief } from "@/lib/store";

export async function POST(request: NextRequest) {
  try {
    const { repoUrl, token } = await request.json();

    if (!repoUrl) {
      return NextResponse.json({ error: "Repository URL is required" }, { status: 400 });
    }

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid GitHub repository URL" }, { status: 400 });
    }

    const { owner, repo } = parsed;
    const authToken = token || undefined;

    // Fetch all data in parallel
    const [repoInfo, files, prs, commits] = await Promise.all([
      fetchRepoInfo(owner, repo, authToken),
      fetchRepoTree(owner, repo, authToken),
      fetchPRs(owner, repo, authToken),
      fetchCommits(owner, repo, authToken),
    ]);

    // Fetch key files
    const [packageJson, readme] = await Promise.all([
      fetchFileContent(owner, repo, "package.json", authToken),
      fetchFileContent(owner, repo, "README.md", authToken),
    ]);

    // Generate the brief
    const brief = generateBrief(repoInfo, files, prs, commits, packageJson, readme);

    // Save to store
    saveBrief(brief);

    return NextResponse.json({ brief });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    const status = message.includes("Not Found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
