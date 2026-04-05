import { Octokit } from "@octokit/rest";
import type {
  RepoInfo,
  FileNode,
  PRSummary,
  CommitSummary,
} from "./types";

function getOctokit(token?: string) {
  return new Octokit({ auth: token || process.env.GITHUB_TOKEN });
}

export async function fetchRepoInfo(
  owner: string,
  repo: string,
  token?: string
): Promise<RepoInfo> {
  const octokit = getOctokit(token);
  const { data } = await octokit.repos.get({ owner, repo });

  return {
    owner: data.owner.login,
    name: data.name,
    fullName: data.full_name,
    description: data.description,
    language: data.language,
    stars: data.stargazers_count,
    forks: data.forks_count,
    defaultBranch: data.default_branch,
    updatedAt: data.updated_at,
    createdAt: data.created_at,
    isPrivate: data.private,
    topics: data.topics || [],
    url: data.html_url,
  };
}

export async function fetchRepoTree(
  owner: string,
  repo: string,
  token?: string
): Promise<FileNode[]> {
  const octokit = getOctokit(token);
  const { data } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: "HEAD",
    recursive: "true",
  });

  return (data.tree || [])
    .filter((item) => item.path && item.type)
    .map((item) => ({
      path: item.path!,
      name: item.path!.split("/").pop()!,
      type: item.type === "tree" ? ("dir" as const) : ("file" as const),
      size: item.size,
    }));
}

export async function fetchPRs(
  owner: string,
  repo: string,
  token?: string
): Promise<PRSummary[]> {
  const octokit = getOctokit(token);

  try {
    const { data } = await octokit.pulls.list({
      owner,
      repo,
      state: "all",
      sort: "updated",
      direction: "desc",
      per_page: 50,
    });

    return data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      mergedAt: pr.merged_at,
      createdAt: pr.created_at,
      closedAt: pr.closed_at,
      author: pr.user?.login || "unknown",
      labels: pr.labels.map((l) => (typeof l === "string" ? l : l.name || "")),
      additions: (pr as Record<string, unknown>).additions as number ?? 0,
      deletions: (pr as Record<string, unknown>).deletions as number ?? 0,
      changedFiles: (pr as Record<string, unknown>).changed_files as number ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function fetchCommits(
  owner: string,
  repo: string,
  token?: string
): Promise<CommitSummary[]> {
  const octokit = getOctokit(token);

  const { data } = await octokit.repos.listCommits({
    owner,
    repo,
    per_page: 100,
  });

  return data.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    author: commit.commit.author?.name || commit.author?.login || "unknown",
    date: commit.commit.author?.date || "",
  }));
}

export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  token?: string
): Promise<string | null> {
  const octokit = getOctokit(token);

  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    if ("content" in data && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return null;
  } catch {
    return null;
  }
}

export function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  // Handle full URLs
  const urlMatch = input.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/\s.]+)/
  );
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/, "") };
  }

  // Handle owner/repo format
  const shortMatch = input.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  return null;
}
