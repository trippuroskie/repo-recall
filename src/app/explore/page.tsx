"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { Star, Code, Loader2, ArrowRight, Search } from "lucide-react";
import type { ProjectBrief } from "@/lib/types";

export default function ExplorePage() {
  const [briefs, setBriefs] = useState<ProjectBrief[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/explore?featured=true");
        if (res.ok) {
          const data = await res.json();
          setBriefs(data.briefs || []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/briefs"
              className="text-sm text-foreground-secondary hover:text-foreground transition-colors"
            >
              Briefs
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-5xl mx-auto px-6 pt-16 pb-10">
          <div className="flex items-center gap-2 mb-3">
            <Search size={20} className="text-foreground-secondary" strokeWidth={1.8} />
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Explore Open Source
            </h1>
          </div>
          <p className="text-base text-foreground-secondary leading-relaxed max-w-lg mb-2">
            Pre-indexed briefs for popular open source repos. Click any repo to
            see its architecture, features, and how it works.
          </p>
          <p className="text-sm text-foreground-secondary/60">
            Want to analyze your own repo?{" "}
            <Link href="/login" className="text-accent hover:underline">
              Sign in with GitHub
            </Link>
          </p>
        </section>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Grid */}
        <section className="max-w-5xl mx-auto px-6 py-10">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-foreground-secondary" />
            </div>
          ) : briefs.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-foreground-secondary">
                No public briefs available yet. Check back soon!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {briefs.map((brief) => (
                <RepoCard key={brief.id} brief={brief} />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
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
            {repoInfo.name}
          </h3>
          <p className="text-xs text-foreground-secondary">{repoInfo.owner}</p>
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
              ? `${(repoInfo.stars / 1000).toFixed(repoInfo.stars >= 10000 ? 0 : 1)}k`
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
