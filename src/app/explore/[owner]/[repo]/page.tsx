"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { OverviewSection } from "@/components/sections/OverviewSection";
import { ArchitectureSection } from "@/components/sections/ArchitectureSection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { BusinessSection } from "@/components/sections/BusinessSection";
import { TimelineSection } from "@/components/sections/TimelineSection";
import { EntrypointsSection } from "@/components/sections/EntrypointsSection";
import { CodemapSection } from "@/components/sections/CodemapSection";
import { createClient } from "@/lib/supabase/client";
import type { ProjectBrief } from "@/lib/types";
import type { User } from "@supabase/supabase-js";
import {
  ExternalLink,
  Loader2,
  ArrowLeft,
  MessageSquare,
  LogIn,
} from "lucide-react";

const sectionLabels: Record<string, string> = {
  overview: "Overview",
  codemap: "Codemap",
  architecture: "Architecture",
  features: "Features",
  business: "Business Context",
  timeline: "Timeline",
  entrypoints: "Where to Start",
};

export default function PublicBriefPage() {
  const params = useParams();
  const [brief, setBrief] = useState<ProjectBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("overview");
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [overviewCodeOpen, setOverviewCodeOpen] = useState(false);
  const [codemapCodeOpen, setCodemapCodeOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const owner = params.owner as string;
  const repo = params.repo as string;

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/explore/${owner}/${repo}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("This repository hasn't been indexed yet.");
          } else {
            setError("Failed to load brief");
          }
          return;
        }
        const data = await res.json();
        setBrief(data.brief);
      } catch {
        setError("Failed to load brief");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repo]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setAuthChecked(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleNav = useCallback((section: string) => {
    setActiveSection(section);
    setOverviewCodeOpen(false);
    setCodemapCodeOpen(false);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin text-foreground-secondary" />
          <p className="text-sm text-foreground-secondary">Loading brief...</p>
        </div>
      </div>
    );
  }

  if (error || !brief) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b border-border">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
            <Link href="/">
              <Logo />
            </Link>
            <UserMenu />
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-foreground-secondary mb-4">
              {error || "Brief not found"}
            </p>
            <Link
              href="/explore"
              className="text-sm text-accent hover:underline"
            >
              Browse all repos
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isOverviewSplit = activeSection === "overview" && overviewCodeOpen;
  const isCodemapSplit = activeSection === "codemap" && codemapCodeOpen;
  const isFullWidth = isOverviewSplit || isCodemapSplit;

  const sectionComponents: Record<string, React.ReactNode> = {
    overview: <OverviewSection brief={brief} onCodePanelToggle={setOverviewCodeOpen} />,
    codemap: <CodemapSection brief={brief} onCodePanelToggle={setCodemapCodeOpen} />,
    architecture: <ArchitectureSection brief={brief} />,
    features: <FeaturesSection brief={brief} />,
    business: <BusinessSection brief={brief} />,
    timeline: <TimelineSection brief={brief} />,
    entrypoints: <EntrypointsSection brief={brief} />,
  };

  return (
    <div className={`${isFullWidth ? "h-screen overflow-hidden" : "min-h-screen"} flex flex-col`}>
      {/* Nav */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/explore"
              className="text-sm text-foreground-secondary hover:text-foreground transition-colors"
            >
              Explore
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Sign-in CTA banner — only for signed-out visitors */}
      {authChecked && !user && (
        <div className="bg-surface border-b border-border">
          <div className="max-w-5xl mx-auto px-6 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground-secondary">
              <MessageSquare size={14} />
              <span>Want to chat with this codebase or analyze your own repos?</span>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover transition-colors"
            >
              <LogIn size={14} />
              Sign in with GitHub
            </Link>
          </div>
        </div>
      )}

      <div className={`flex-1 flex w-full ${isFullWidth ? "" : "max-w-5xl mx-auto"} min-h-0`}>
        {/* Section nav sidebar */}
        <nav className="hidden md:block w-48 shrink-0 border-r border-border py-6 pr-4">
          <Link
            href="/explore"
            className="flex items-center gap-1.5 text-xs text-foreground-secondary hover:text-foreground transition-colors mb-6 px-3"
          >
            <ArrowLeft size={12} />
            All repos
          </Link>
          <div className="space-y-0.5">
            {Object.entries(sectionLabels).map(([id, label]) => (
              <button
                key={id}
                onClick={() => handleNav(id)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  activeSection === id
                    ? "bg-surface text-foreground font-medium"
                    : "text-foreground-secondary hover:bg-surface-hover"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div
          ref={contentRef}
          className={`flex-1 min-w-0 ${isFullWidth ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          <div
            className={
              isFullWidth
                ? "w-full h-full"
                : "max-w-3xl mx-auto px-6 md:px-12 py-8"
            }
          >
            {/* Breadcrumb */}
            {!isFullWidth && (
              <div className="flex items-center gap-2 text-xs text-foreground-secondary/60 mb-4">
                <Link href="/explore" className="hover:text-foreground transition-colors">
                  Explore
                </Link>
                <span>/</span>
                <span>{brief.repoInfo.owner}</span>
                <span>/</span>
                <span className="text-foreground-secondary">{brief.repoInfo.name}</span>
                <div className="ml-auto">
                  <a
                    href={brief.repoInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-foreground-secondary hover:text-foreground transition-colors"
                  >
                    <ExternalLink size={12} />
                    GitHub
                  </a>
                </div>
              </div>
            )}

            {/* Mobile section nav */}
            {!isFullWidth && (
              <div className="flex gap-2 overflow-x-auto pb-4 mb-6 md:hidden">
                {Object.entries(sectionLabels).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => handleNav(id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      activeSection === id
                        ? "bg-surface text-foreground"
                        : "text-foreground-secondary hover:bg-surface-hover"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Section content */}
            <div
              className={isFullWidth ? "" : "max-w-3xl"}
              style={isFullWidth ? { height: "100%" } : undefined}
            >
              {sectionComponents[activeSection]}
              {!isFullWidth && <div style={{ height: 80 }} aria-hidden />}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      {!isFullWidth && (
        <footer className="border-t border-border">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <p className="text-xs text-foreground-secondary/50">
              RepoRecall — The fastest way to get back into your own code.
            </p>
            <p className="text-xs text-foreground-secondary/50">MVP</p>
          </div>
        </footer>
      )}
    </div>
  );
}
