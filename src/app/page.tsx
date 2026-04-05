"use client";

import { Logo } from "@/components/Logo";
import { AnalyzeForm } from "@/components/AnalyzeForm";
import {
  FileText,
  Layers,
  Briefcase,
  GitPullRequest,
  Compass,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

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
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Logo />
          <Link
            href="/dashboard"
            className="text-sm text-foreground-secondary hover:text-foreground transition-colors"
          >
            Dashboard
          </Link>
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
            href="/dashboard"
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
