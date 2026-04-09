"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { AnalyzeForm } from "@/components/AnalyzeForm";
import {
  FileText,
  Layers,
  Briefcase,
  GitPullRequest,
  Compass,
  ArrowRight,
  Star,
  Code,
} from "lucide-react";
import Link from "next/link";
import { UserMenu } from "@/components/UserMenu";
import type { ProjectBrief } from "@/lib/types";

const features = [
  {
    icon: FileText,
    title: "Project Brief",
    description:
      "Get a structured overview of what the project does, who it's for, and how it works.",
  },
  {
    icon: Layers,
    title: "Architecture Map",
    description:
      "See the tech stack, key modules, APIs, and how everything connects.",
  },
  {
    icon: Briefcase,
    title: "Business Context",
    description:
      "Understand the product logic — what each feature supports and why it exists.",
  },
  {
    icon: GitPullRequest,
    title: "Change Timeline",
    description:
      "See how the project evolved through PRs and commits, grouped into milestones.",
  },
  {
    icon: Compass,
    title: "Where to Start",
    description:
      "Get recommended files and flows to inspect first so you can jump in confidently.",
  },
];

export default function HomePage() {
  const [featuredBriefs, setFeaturedBriefs] = useState<ProjectBrief[]>([]);

  useEffect(() => {
    fetch("/api/explore?featured=true&limit=6")
      .then((res) => (res.ok ? res.json() : { briefs: [] }))
      .then((data) => setFeaturedBriefs(data.briefs || []))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Logo />
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

      {/* Hero */}
      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-6 pt-20 pb-16">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight leading-[1.1] mb-4">
              Get back into
              <br />
              your own code.
            </h1>
            <p className="text-lg text-foreground-secondary leading-relaxed mb-8 max-w-lg">
              RepoRecall generates a structured briefing from any GitHub repo so
              you can understand what it does, how it works, and where to start
              — in minutes, not hours.
            </p>
            <AnalyzeForm />
            <p className="text-xs text-foreground-secondary/50 mt-3">
              Works with any public GitHub repo. Add a token for private repos.
            </p>
          </div>
        </section>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Features */}
        <section className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-8">
            What you get
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="group">
                  <div className="flex items-center gap-2.5 mb-2">
                    <Icon
                      size={18}
                      className="text-foreground-secondary"
                      strokeWidth={1.8}
                    />
                    <h3 className="text-sm font-semibold text-foreground">
                      {feature.title}
                    </h3>
                  </div>
                  <p className="text-sm text-foreground-secondary leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Popular Repos */}
        {featuredBriefs.length > 0 && (
          <>
            <div className="border-t border-border" />
            <section className="max-w-5xl mx-auto px-6 py-16">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider">
                  Popular Repos
                </h2>
                <Link
                  href="/explore"
                  className="inline-flex items-center gap-1 text-sm text-accent hover:text-accent-hover transition-colors"
                >
                  View all
                  <ArrowRight size={14} />
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {featuredBriefs.map((brief) => {
                  const { repoInfo, overview } = brief;
                  const desc =
                    repoInfo.description ||
                    overview.summary?.slice(0, 120) ||
                    "No description";
                  const truncDesc =
                    desc.length > 120 ? desc.slice(0, 117) + "..." : desc;
                  return (
                    <Link
                      key={brief.id}
                      href={`/explore/${repoInfo.owner}/${repoInfo.name}`}
                      className="group block border border-border rounded-xl p-5 hover:border-border-hover hover:bg-surface-hover transition-all"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-accent transition-colors">
                            {repoInfo.name}
                          </h3>
                          <p className="text-xs text-foreground-secondary">
                            {repoInfo.owner}
                          </p>
                        </div>
                        <ArrowRight
                          size={14}
                          className="text-foreground-secondary/40 group-hover:text-accent transition-colors mt-0.5 shrink-0"
                        />
                      </div>
                      <p className="text-xs text-foreground-secondary leading-relaxed mb-3">
                        {truncDesc}
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
                })}
              </div>
            </section>
          </>
        )}

        {/* Divider */}
        <div className="border-t border-border" />

        {/* CTA */}
        <section className="max-w-5xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-foreground tracking-tight mb-3">
            Built for solo builders
          </h2>
          <p className="text-foreground-secondary text-base mb-6 max-w-md mx-auto">
            Not a code reviewer. Not a team wiki. RepoRecall is a project
            briefing product for developers returning to their own code.
          </p>
          <Link
            href="/briefs"
            className="inline-flex items-center gap-2 bg-foreground text-background px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-foreground/90 transition-colors"
          >
            View Your Briefs
            <ArrowRight size={14} />
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
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
