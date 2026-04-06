"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, GitBranch, Lock } from "lucide-react";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import type { ProjectBrief } from "@/lib/types";

const EXAMPLE_REPOS = [
  { name: "openai/codex", description: "AI coding agent", tags: ["TypeScript", "Python", "AI"] },
  { name: "block/goose", description: "AI agent framework", tags: ["Rust", "TypeScript", "Python"] },
  { name: "All-Hands-AI/OpenHands", description: "AI software dev platform", tags: ["Python", "TypeScript", "Docker"] },
  { name: "supabase/supabase", description: "Open source Firebase alternative", tags: ["TypeScript", "Go", "Elixir"] },
  { name: "calcom/cal.com", description: "Scheduling infrastructure", tags: ["TypeScript", "Next.js", "Prisma"] },
  { name: "maybe-finance/maybe", description: "Personal finance OS", tags: ["Ruby", "TypeScript", "React"] },
];

export function AnalyzeForm({ compact = false }: { compact?: boolean }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleComplete = useCallback(
    (brief: ProjectBrief) => {
      router.push(`/brief/${brief.id}`);
    },
    [router]
  );

  const handleError = useCallback((message: string) => {
    setError(message);
    setAnalyzing(false);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    setError(null);
    setAnalyzing(true);
  }

  return (
    <>
      {/* Streaming analysis progress overlay */}
      {analyzing && !error && (
        <AnalysisProgress
          repoUrl={repoUrl}
          token={token || undefined}
          onComplete={handleComplete}
          onError={handleError}
        />
      )}

      <form onSubmit={handleSubmit} className="w-full max-w-xl">
        <div className="flex flex-col gap-3">
          <div
            className={`flex items-center gap-2 border border-border rounded-xl px-4 ${
              compact ? "py-2.5" : "py-3"
            } bg-white focus-within:border-foreground/30 transition-colors`}
          >
            <GitBranch size={18} className="text-foreground-secondary shrink-0" />
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="Paste a GitHub repo URL or owner/repo"
              className="flex-1 bg-transparent outline-none text-foreground placeholder:text-foreground-secondary/50 text-sm"
              disabled={analyzing}
            />
            <button
              type="submit"
              disabled={analyzing || !repoUrl.trim()}
              className="flex items-center gap-1.5 bg-foreground text-background px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
            >
              {analyzing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Analyzing
                </>
              ) : (
                <>
                  Recall
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="flex items-center gap-1.5 text-xs text-foreground-secondary hover:text-foreground transition-colors"
            >
              <Lock size={12} />
              {showToken ? "Hide" : "Private repo? Add token"}
            </button>
          </div>

          {showToken && (
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="GitHub personal access token"
              className="border border-border rounded-xl px-4 py-2.5 bg-white outline-none text-sm focus:border-foreground/30 transition-colors placeholder:text-foreground-secondary/50"
              disabled={analyzing}
            />
          )}

          {/* Example repos */}
          {!compact && (
            <div className="pt-1">
              <p className="text-xs text-foreground-secondary/50 mb-2">
                Try an example
              </p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_REPOS.map((repo) => (
                  <button
                    key={repo.name}
                    type="button"
                    onClick={() => setRepoUrl(repo.name)}
                    className="group flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-xs text-foreground-secondary hover:border-border-hover hover:text-foreground hover:bg-surface-hover transition-all"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="shrink-0 opacity-50 group-hover:opacity-70">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                    <span className="font-medium">{repo.name.split("/")[1]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
        </div>
      </form>
    </>
  );
}
