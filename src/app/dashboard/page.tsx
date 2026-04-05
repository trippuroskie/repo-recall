"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { AnalyzeForm } from "@/components/AnalyzeForm";
import type { ProjectBrief } from "@/lib/types";
import {
  Clock,
  Star,
  GitFork,
  Lock,
  Globe,
  Trash2,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

export default function DashboardPage() {
  const [briefs, setBriefs] = useState<ProjectBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchBriefs();
  }, []);

  async function fetchBriefs() {
    try {
      const res = await fetch("/api/briefs");
      const data = await res.json();
      setBriefs(data.briefs);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await fetch(`/api/briefs/${id}`, { method: "DELETE" });
    setBriefs((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 bg-foreground text-background px-3.5 py-1.5 rounded-lg text-sm font-medium hover:bg-foreground/90 transition-colors"
          >
            <Plus size={14} />
            New Brief
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        {/* New brief form */}
        {showForm && (
          <div className="mb-8 pb-8 border-b border-border animate-fade-in">
            <h2 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-4">
              Analyze a repository
            </h2>
            <AnalyzeForm compact />
          </div>
        )}

        {/* Briefs list */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Your Briefs
            </h1>
            <p className="text-sm text-foreground-secondary mt-1">
              {briefs.length === 0
                ? "No briefs yet. Analyze a repo to get started."
                : `${briefs.length} project brief(s)`}
            </p>
          </div>
          {briefs.length > 0 && (
            <div className="relative shrink-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-secondary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter briefs…"
                className="pl-8 pr-3 py-1.5 border border-border rounded-lg text-sm bg-white outline-none focus:border-foreground/30 transition-colors w-48 placeholder:text-foreground-secondary/50"
              />
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="border border-border rounded-xl p-5 animate-pulse-subtle"
              >
                <div className="h-4 bg-surface rounded w-48 mb-2" />
                <div className="h-3 bg-surface rounded w-96" />
              </div>
            ))}
          </div>
        ) : briefs.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-12 text-center">
            <p className="text-foreground-secondary text-sm mb-4">
              Paste a GitHub repo URL on the{" "}
              <Link href="/" className="text-accent hover:underline">
                home page
              </Link>{" "}
              or click &quot;New Brief&quot; above.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {briefs.filter((b) => {
              if (!searchQuery) return true;
              const q = searchQuery.toLowerCase();
              return (
                b.repoInfo.name.toLowerCase().includes(q) ||
                b.repoInfo.owner.toLowerCase().includes(q) ||
                b.overview.summary.toLowerCase().includes(q) ||
                b.architecture.stack.some((t) => t.toLowerCase().includes(q))
              );
            }).map((brief) => (
              <Link
                key={brief.id}
                href={`/brief/${brief.id}`}
                className="group border border-border rounded-xl p-5 hover:border-border-hover hover:bg-surface-hover/50 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-foreground truncate">
                        {brief.repoInfo.name}
                      </h3>
                      {brief.repoInfo.isPrivate ? (
                        <Lock size={12} className="text-foreground-secondary shrink-0" />
                      ) : (
                        <Globe size={12} className="text-foreground-secondary shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-foreground-secondary truncate mb-2">
                      {brief.overview.summary.slice(0, 120)}
                      {brief.overview.summary.length > 120 ? "..." : ""}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-foreground-secondary/70">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {formatDistanceToNow(new Date(brief.generatedAt), {
                          addSuffix: true,
                        })}
                      </span>
                      {brief.repoInfo.language && (
                        <span>{brief.repoInfo.language}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Star size={11} />
                        {brief.repoInfo.stars}
                      </span>
                      <span className="flex items-center gap-1">
                        <GitFork size={11} />
                        {brief.repoInfo.forks}
                      </span>
                      <span>
                        {brief.features.length} feature(s)
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(brief.id, e)}
                    className="p-2 text-foreground-secondary/40 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    title="Delete brief"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Stack tags */}
                {brief.architecture.stack.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {brief.architecture.stack.slice(0, 6).map((tech) => (
                      <span
                        key={tech}
                        className="px-2 py-0.5 bg-surface rounded text-xs text-foreground-secondary"
                      >
                        {tech}
                      </span>
                    ))}
                    {brief.architecture.stack.length > 6 && (
                      <span className="px-2 py-0.5 text-xs text-foreground-secondary/50">
                        +{brief.architecture.stack.length - 6} more
                      </span>
                    )}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
