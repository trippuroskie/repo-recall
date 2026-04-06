// Tool executor: runs agent tool calls against GitHub API

import { Octokit } from "@octokit/rest";
import type { FileNode } from "../types";
import type { AgentToolCall, ToolResult } from "./tools";

const SKIP_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "bmp",
  "woff", "woff2", "ttf", "eot", "otf",
  "zip", "tar", "gz", "bz2", "7z", "rar",
  "pdf", "doc", "docx", "xls", "xlsx",
  "mp3", "mp4", "avi", "mov", "wav",
  "exe", "dll", "so", "dylib", "bin",
  "lock", "map",
]);

const SKIP_PATHS = [
  "node_modules/",
  "dist/",
  "build/",
  ".git/",
  ".next/",
  "__pycache__/",
  ".cache/",
  "vendor/",
  "coverage/",
];

const SKIP_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "composer.lock",
  "Gemfile.lock",
  "Cargo.lock",
  "go.sum",
]);

const MAX_FILE_SIZE = 100_000; // 100KB

function shouldSkipFile(path: string): string | null {
  const name = path.split("/").pop() || "";
  const ext = name.split(".").pop()?.toLowerCase() || "";

  if (SKIP_FILES.has(name)) return `Skipped lock file: ${name}`;
  if (SKIP_EXTENSIONS.has(ext)) return `Skipped binary/asset file: ${name}`;
  for (const prefix of SKIP_PATHS) {
    if (path.startsWith(prefix) || path.includes(`/${prefix}`))
      return `Skipped excluded directory: ${prefix}`;
  }
  return null;
}

export interface ExecutorConfig {
  owner: string;
  repo: string;
  token?: string;
  fileTree: FileNode[];
}

export interface RateLimitInfo {
  remaining: number;
  total: number;
  resetAt: Date;
}

export class ToolExecutor {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private fileTree: FileNode[];
  private apiCalls = 0;
  private maxApiCalls = 80; // leave headroom under the ~100 budget
  rateLimit: RateLimitInfo = { remaining: 5000, total: 5000, resetAt: new Date() };

  constructor(config: ExecutorConfig) {
    this.octokit = new Octokit({ auth: config.token || process.env.GITHUB_TOKEN });
    this.owner = config.owner;
    this.repo = config.repo;
    this.fileTree = config.fileTree;
  }

  get apiCallCount() {
    return this.apiCalls;
  }

  get budgetRemaining() {
    return this.maxApiCalls - this.apiCalls;
  }

  async execute(toolCall: AgentToolCall): Promise<ToolResult> {
    switch (toolCall.name) {
      case "readFile":
        return this.readFile(toolCall.params.path);
      case "searchCode":
        return this.searchCode(toolCall.params.query, toolCall.params.glob);
      case "listDirectory":
        return this.listDirectory(toolCall.params.path);
      case "readFileLines":
        return this.readFileLines(
          toolCall.params.path,
          toolCall.params.startLine,
          toolCall.params.endLine
        );
    }
  }

  private async readFile(path: string): Promise<ToolResult> {
    const base = { tool: "readFile" as const, params: { path } };
    const skip = shouldSkipFile(path);
    if (skip) return { ...base, result: skip };

    if (this.apiCalls >= this.maxApiCalls)
      return { ...base, result: "API budget exhausted. Finish with what you have.", error: "budget" };

    try {
      this.apiCalls++;
      const { data, headers } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
      });
      this.updateRateLimit(headers);

      if (!("content" in data) || !data.content)
        return { ...base, result: "Not a readable file (directory or submodule)" };

      const size = data.size || 0;
      if (size > MAX_FILE_SIZE)
        return { ...base, result: `File too large (${(size / 1024).toFixed(0)}KB > 100KB limit). Use readFileLines for specific sections.` };

      const content = Buffer.from(data.content, "base64").toString("utf-8");
      const lines = content.split("\n");
      const numbered = lines.map((line, i) => `${i + 1}: ${line}`).join("\n");
      const truncated = lines.length > 500;
      const result = truncated
        ? numbered.split("\n").slice(0, 500).join("\n") + `\n... (truncated at 500/${lines.length} lines)`
        : numbered;

      return { ...base, result, truncated };
    } catch {
      return { ...base, result: `File not found: ${path}`, error: "not_found" };
    }
  }

  private async searchCode(query: string, glob?: string): Promise<ToolResult> {
    const base = { tool: "searchCode" as const, params: { query, glob } };

    if (this.apiCalls >= this.maxApiCalls)
      return { ...base, result: "API budget exhausted.", error: "budget" };

    try {
      this.apiCalls++;
      let q = `${query} repo:${this.owner}/${this.repo}`;
      if (glob) q += ` path:${glob}`;

      const { data, headers } = await this.octokit.rest.search.code({
        q,
        per_page: 10,
        mediaType: { previews: ["text-match"] },
      });
      this.updateRateLimit(headers);

      if (data.items.length === 0)
        return { ...base, result: "No results found." };

      const results = data.items.map((item) => {
        const matches = (item.text_matches || [])
          .map((m) => m.fragment)
          .join("\n---\n");
        return `### ${item.path}\n${matches || "(no preview available)"}`;
      });

      return {
        ...base,
        result: `Found ${data.total_count} result(s). Top ${results.length}:\n\n${results.join("\n\n")}`,
      };
    } catch {
      return { ...base, result: `Search failed for: ${query}`, error: "search_failed" };
    }
  }

  private listDirectory(path: string): Promise<ToolResult> {
    const base = { tool: "listDirectory" as const, params: { path } };
    const normalizedPath = path.replace(/^\/|\/$/g, "");

    const entries = this.fileTree.filter((f) => {
      if (normalizedPath === "") {
        // Root: show only top-level items
        return !f.path.includes("/");
      }
      // Check if the file is a direct child of the requested directory
      if (!f.path.startsWith(normalizedPath + "/")) return false;
      const relative = f.path.slice(normalizedPath.length + 1);
      return !relative.includes("/");
    });

    if (entries.length === 0) {
      // Try showing items that start with this prefix (directory itself might not be in tree)
      const children = this.fileTree.filter((f) =>
        f.path.startsWith(normalizedPath + "/")
      );
      if (children.length === 0)
        return Promise.resolve({ ...base, result: `Directory not found: ${path}` });

      // Deduplicate to immediate children
      const seen = new Set<string>();
      const deduped: { name: string; type: "file" | "dir" }[] = [];
      for (const f of children) {
        const relative = f.path.slice(normalizedPath.length + 1);
        const firstPart = relative.split("/")[0];
        if (!seen.has(firstPart)) {
          seen.add(firstPart);
          deduped.push({
            name: firstPart,
            type: relative.includes("/") ? "dir" : f.type,
          });
        }
      }
      const listing = deduped
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1))
        .map((e) => `${e.type === "dir" ? "📁" : "📄"} ${e.name}`)
        .join("\n");
      return Promise.resolve({ ...base, result: `${normalizedPath}/\n${listing}` });
    }

    const listing = entries
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1))
      .map((e) => `${e.type === "dir" ? "📁" : "📄"} ${e.name}`)
      .join("\n");

    return Promise.resolve({ ...base, result: `${normalizedPath || "."}/\n${listing}` });
  }

  private async readFileLines(
    path: string,
    startLine: number,
    endLine: number
  ): Promise<ToolResult> {
    const base = { tool: "readFileLines" as const, params: { path, startLine, endLine } };
    const skip = shouldSkipFile(path);
    if (skip) return { ...base, result: skip };

    if (this.apiCalls >= this.maxApiCalls)
      return { ...base, result: "API budget exhausted.", error: "budget" };

    try {
      this.apiCalls++;
      const { data, headers } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
      });
      this.updateRateLimit(headers);

      if (!("content" in data) || !data.content)
        return { ...base, result: "Not a readable file" };

      const content = Buffer.from(data.content, "base64").toString("utf-8");
      const lines = content.split("\n");
      const start = Math.max(1, startLine);
      const end = Math.min(lines.length, endLine);
      const slice = lines
        .slice(start - 1, end)
        .map((line, i) => `${start + i}: ${line}`)
        .join("\n");

      return { ...base, result: `${path} (lines ${start}-${end} of ${lines.length}):\n${slice}` };
    } catch {
      return { ...base, result: `File not found: ${path}`, error: "not_found" };
    }
  }

  private updateRateLimit(headers: Record<string, string | number | undefined>) {
    const remaining = parseInt(String(headers["x-ratelimit-remaining"] ?? "5000"), 10);
    const total = parseInt(String(headers["x-ratelimit-limit"] ?? "5000"), 10);
    const reset = parseInt(String(headers["x-ratelimit-reset"] ?? "0"), 10);
    this.rateLimit = { remaining, total, resetAt: new Date(reset * 1000) };
  }
}
