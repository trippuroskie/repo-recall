"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import {
  ArrowRight,
  Star,
  Code,
  Search,
  Plus,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import type { ProjectBrief } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [briefs, setBriefs] = useState<ProjectBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch("/api/explore?featured=true")
      .then((res) => (res.ok ? res.json() : { briefs: [] }))
      .then((data) => setBriefs(data.briefs || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/analyze?repo=${encodeURIComponent(searchQuery.trim())}`);
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <Link
              href="/briefs"
              className="text-sm text-foreground-secondary hover:text-foreground transition-colors"
            >
              My Briefs
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero: heading + search */}
        <section className="max-w-6xl mx-auto px-6 pt-16 pb-10">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight text-center mb-6">
            Which repo would you like to understand?
          </h1>
          <form onSubmit={handleSearch} className="max-w-xl mx-auto">
            <div className="flex items-center gap-2 border border-border rounded-xl px-4 py-3 bg-white focus-within:border-foreground/30 transition-colors">
              <Search size={18} className="text-foreground-secondary shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for repositories (or paste a link)"
                className="flex-1 text-sm outline-none bg-transparent placeholder:text-foreground-secondary/50"
              />
              {searchQuery.trim() && (
                <button
                  type="submit"
                  className="text-foreground-secondary hover:text-foreground transition-colors"
                >
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </form>
        </section>

        {/* Repo grid */}
        <section className="max-w-6xl mx-auto px-6 pb-16">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-foreground-secondary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* "Analyze repo" card */}
              <Link
                href="/login"
                className="group block border border-dashed border-border rounded-xl p-5 hover:border-border-hover hover:bg-surface-hover transition-all min-h-[140px] flex flex-col justify-center"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Plus size={16} className="text-foreground-secondary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Analyze a repo
                  </h3>
                </div>
                <p className="text-xs text-foreground-secondary leading-relaxed">
                  Sign in with GitHub to analyze any public or private repository.
                </p>
              </Link>

              {/* Pre-indexed repo cards */}
              {briefs.map((brief) => (
                <RepoCard key={brief.id} brief={brief} />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-foreground-secondary/50">
            RepoRecall — The fastest way to get back into your own code.
          </p>
          <p className="text-xs text-foreground-secondary/50">MVP</p>
        </div>
      </footer>
    </div>
  );
}

function RepoCard({ brief }: { brief: ProjectBrief }) {
  const { repoInfo, overview } = brief;
  const description =
    repoInfo.description || overview.summary?.slice(0, 120) || "No description";
  const truncatedDesc =
    description.length > 120 ? description.slice(0, 117) + "..." : description;

  return (
    <Link
      href={`/explore/${repoInfo.owner}/${repoInfo.name}`}
      className="group block border border-border rounded-xl p-5 hover:border-border-hover hover:bg-surface-hover transition-all"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-accent transition-colors">
            {repoInfo.owner} / {repoInfo.name}
          </h3>
        </div>
        <ArrowRight
          size={14}
          className="text-foreground-secondary/40 group-hover:text-accent transition-colors mt-0.5 shrink-0"
        />
      </div>
      <p className="text-xs text-foreground-secondary leading-relaxed mb-3">
        {truncatedDesc}
      </p>
      <div className="flex items-center gap-3 text-xs text-foreground-secondary/70">
        {repoInfo.stars > 0 && (
          <span className="flex items-center gap-1">
            <Star size={12} />
            {repoInfo.stars >= 1000
              ? `${(repoInfo.stars / 1000).toFixed(
                  repoInfo.stars >= 10000 ? 0 : 1
                )}k`
              : repoInfo.stars}
          </span>
        )}
        {repoInfo.language && (
          <span className="flex items-center gap-1">
            <Code size={12} />
            {repoInfo.language}
          </span>
        )}
      </div>
    </Link>
  );
}
