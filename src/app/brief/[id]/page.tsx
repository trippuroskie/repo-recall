"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { BriefSidebar } from "@/components/BriefSidebar";
import { OverviewSection } from "@/components/sections/OverviewSection";
import { ArchitectureSection } from "@/components/sections/ArchitectureSection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { BusinessSection } from "@/components/sections/BusinessSection";
import { TimelineSection } from "@/components/sections/TimelineSection";
import { EntrypointsSection } from "@/components/sections/EntrypointsSection";
import { CodemapSection } from "@/components/sections/CodemapSection";
import { ChatPanel } from "@/components/ChatPanel";
import type { ProjectBrief } from "@/lib/types";
import {
  ExternalLink,
  Clock,
  Loader2,
  RefreshCw,
  Download,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function BriefPageWrapper() {
  return (
    <Suspense>
      <BriefPage />
    </Suspense>
  );
}

function BriefPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [brief, setBrief] = useState<ProjectBrief | null>(null);
  const [allBriefs, setAllBriefs] = useState<ProjectBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [chatSessionId, setChatSessionId] = useState<string | undefined>(undefined);
  const [overviewCodeOpen, setOverviewCodeOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const [briefRes, briefsRes] = await Promise.all([
          fetch(`/api/briefs/${params.id}`),
          fetch("/api/briefs"),
        ]);
        if (!briefRes.ok) throw new Error("Brief not found");
        const briefData = await briefRes.json();
        setBrief(briefData.brief);

        if (briefsRes.ok) {
          const briefsData = await briefsRes.json();
          setAllBriefs(briefsData.briefs);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load brief");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  const handleNav = useCallback((section: string) => {
    setActiveSection(section);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleRepoSelect = useCallback(
    (id: string) => {
      router.push(`/brief/${id}`);
    },
    [router]
  );

  const handleReanalyze = useCallback(async () => {
    if (!brief || reanalyzing) return;
    setReanalyzing(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: `${brief.repoInfo.owner}/${brief.repoInfo.name}` }),
      });
      if (!res.ok) throw new Error("Re-analysis failed");
      const data = await res.json();
      router.push(`/brief/${data.brief.id}`);
    } catch {
      setReanalyzing(false);
    }
  }, [brief, reanalyzing, router]);

  const handleOpenChat = useCallback(
    (sessionId: string, briefId: string) => {
      if (briefId !== params.id) {
        router.push(`/brief/${briefId}?chat=${sessionId}`);
      } else {
        setChatSessionId(sessionId);
      }
    },
    [params.id, router]
  );

  const handleExport = useCallback(() => {
    if (!brief) return;
    const blob = new Blob([JSON.stringify(brief, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brief.repoInfo.owner}-${brief.repoInfo.name}-brief.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [brief]);

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-foreground-secondary mb-4">
            {error || "Brief not found"}
          </p>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-accent hover:underline"
          >
            Go back home
          </button>
        </div>
      </div>
    );
  }

  const isCodemap = activeSection === "codemap";
  const isOverviewSplit = activeSection === "overview" && overviewCodeOpen;
  const isFullWidth = isCodemap || isOverviewSplit;

  const sectionComponents: Record<string, React.ReactNode> = {
    overview: <OverviewSection brief={brief} onCodePanelToggle={setOverviewCodeOpen} />,
    codemap: <CodemapSection brief={brief} />,
    architecture: <ArchitectureSection brief={brief} />,
    features: <FeaturesSection brief={brief} />,
    business: <BusinessSection brief={brief} />,
    timeline: <TimelineSection brief={brief} />,
    entrypoints: <EntrypointsSection brief={brief} />,
  };

  // Breadcrumb labels
  const sectionLabels: Record<string, string> = {
    overview: "Overview",
    codemap: "Codemap",
    architecture: "Architecture",
    features: "Features",
    business: "Business Context",
    timeline: "Timeline",
    entrypoints: "Where to Start",
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100%",
        backgroundColor: "#ffffff",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        color: "rgb(55,53,47)",
      }}
    >
      {/* Sidebar */}
      <BriefSidebar
        activeSection={activeSection}
        onSectionChange={handleNav}
        brief={brief}
        allBriefs={allBriefs}
        onRepoSelect={handleRepoSelect}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
        onConnectNew={() => router.push("/")}
        onOpenChat={handleOpenChat}
      />

      {/* Main content + chat bar column */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          height: "100%",
        }}
      >
        <div
          ref={contentRef}
          style={{
            flex: 1,
            overflowY: isFullWidth ? "hidden" : "auto",
            display: "flex",
            justifyContent: isFullWidth ? "stretch" : "center",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: isFullWidth ? "none" : 760,
              padding: isFullWidth ? "0" : "32px 48px 48px",
          }}
        >
          {/* Breadcrumb (hidden in full-width modes) */}
          {!isFullWidth && <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "rgb(160,159,156)",
              marginBottom: 16,
            }}
          >
            <span>{brief.repoInfo.name}</span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span style={{ color: "rgb(100,99,97)" }}>
              {sectionLabels[activeSection] || "Overview"}
            </span>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <span className="flex items-center gap-1.5 text-xs text-foreground-secondary">
                <Clock size={12} />
                {formatDistanceToNow(new Date(brief.generatedAt), {
                  addSuffix: true,
                })}
              </span>
              <button
                onClick={handleReanalyze}
                disabled={reanalyzing}
                className="flex items-center gap-1.5 text-xs text-foreground-secondary hover:text-foreground transition-colors disabled:opacity-40"
                title="Re-analyze this repository"
              >
                <RefreshCw size={12} className={reanalyzing ? "animate-spin" : ""} />
                {reanalyzing ? "Analyzing…" : "Refresh"}
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 text-xs text-foreground-secondary hover:text-foreground transition-colors"
                title="Export brief as JSON"
              >
                <Download size={12} />
                Export
              </button>
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
          </div>}

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
          <div className={isFullWidth ? "" : "max-w-3xl"} style={isFullWidth ? { height: "100%" } : undefined}>
            {sectionComponents[activeSection]}
            {/* Spacer so content can scroll above the floating chat bar */}
            {!isFullWidth && <div style={{ height: 160 }} aria-hidden />}
          </div>
        </div>
        </div>

        {/* Chat */}
        <ChatPanel brief={brief} onNavigateToBrief={handleRepoSelect} initialSessionId={chatSessionId ?? searchParams.get("chat") ?? undefined} sidebarWidth={sidebarCollapsed ? 48 : 240} />
      </div>
    </div>
  );
}
