"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
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
  MessageSquare,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

interface ChatConversation {
  sessionId: string;
  briefId: string;
  title: string;
  repoFullName: string;
  repoName: string;
  repoOwner: string;
  lastMessage: string;
  lastRole: string;
  lastTimestamp: string;
  messageCount: number;
  createdAt: string;
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const [briefs, setBriefs] = useState<ProjectBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatConversation[]>([]);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const err = searchParams.get("error");
    if (err) {
      setAnalyzeError(err);
      window.history.replaceState({}, "", "/briefs");
    }
  }, [searchParams]);

  const filteredBriefs = briefs.filter((b) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.repoInfo.name.toLowerCase().includes(q) ||
      b.repoInfo.owner.toLowerCase().includes(q) ||
      b.overview.summary.toLowerCase().includes(q) ||
      b.architecture.stack.some((t) => t.toLowerCase().includes(q))
    );
  });

  useEffect(() => {
    fetchBriefs();
    fetchChatHistory();
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

  async function fetchChatHistory() {
    setChatHistoryLoading(true);
    try {
      const res = await fetch("/api/chat/history");
      if (res.ok) {
        const data = await res.json();
        setChatHistory(data.conversations ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setChatHistoryLoading(false);
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1.5 bg-foreground text-background px-3.5 py-1.5 rounded-lg text-sm font-medium hover:bg-foreground/90 transition-colors"
            >
              <Plus size={14} />
              New Brief
            </button>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        {analyzeError && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 animate-fade-in">
            {analyzeError}
          </div>
        )}

        {/* New brief form (hidden when empty — the empty state has its own form) */}
        {showForm && briefs.length > 0 && (
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
                ? "Get started by analyzing a repo below."
                : searchQuery
                  ? `${filteredBriefs.length} of ${briefs.length} brief(s)`
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
          <div className="border border-border rounded-xl p-10 text-center">
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Analyze your first repo
            </h2>
            <p className="text-foreground-secondary text-sm mb-6 max-w-md mx-auto">
              Paste a GitHub repo URL below to generate a structured briefing
              — architecture, features, business context, and where to start.
            </p>
            <div className="max-w-lg mx-auto">
              <AnalyzeForm compact />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredBriefs.map((brief) => (
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

        {/* Chat History Section */}
        <div className="mt-10">
          <button
            onClick={() => setChatHistoryOpen((p) => !p)}
            className="flex items-center gap-2 mb-4 group"
          >
            {chatHistoryOpen ? <ChevronDown size={16} className="text-foreground-secondary" /> : <ChevronRight size={16} className="text-foreground-secondary" />}
            <h2 className="text-lg font-bold text-foreground tracking-tight">
              Chat History
            </h2>
            {chatHistory.length > 0 && (
              <span className="text-xs text-foreground-secondary/70 bg-surface px-2 py-0.5 rounded-full">
                {chatHistory.length}
              </span>
            )}
          </button>

          {chatHistoryOpen && (
            <div className="animate-fade-in">
              {chatHistoryLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin text-foreground-secondary">
                    <Clock size={16} />
                  </div>
                </div>
              ) : chatHistory.length === 0 ? (
                <div className="border border-dashed border-border rounded-xl p-8 text-center">
                  <p className="text-foreground-secondary text-sm">
                    No chat history yet. Start a conversation from any brief.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {(() => {
                    // Group by repo
                    const groups = new Map<string, { repoName: string; briefId: string; sessions: ChatConversation[] }>();
                    for (const conv of chatHistory) {
                      if (!groups.has(conv.briefId)) {
                        groups.set(conv.briefId, { repoName: conv.repoName, briefId: conv.briefId, sessions: [] });
                      }
                      groups.get(conv.briefId)!.sessions.push(conv);
                    }
                    return Array.from(groups.values()).map((group) => (
                      <div key={group.briefId} className="border border-border rounded-xl overflow-hidden">
                        <div className="px-4 py-2.5 bg-surface/50 border-b border-border flex items-center gap-2">
                          <MessageSquare size={13} className="text-foreground-secondary" />
                          <span className="text-sm font-medium text-foreground">{group.repoName}</span>
                          <span className="text-xs text-foreground-secondary/60">{group.sessions.length} chat(s)</span>
                        </div>
                        {group.sessions.map((conv, i) => (
                          <Link
                            key={conv.sessionId}
                            href={`/brief/${conv.briefId}?chat=${conv.sessionId}`}
                            className={`block px-4 py-3 hover:bg-surface-hover/50 transition-colors ${i > 0 ? "border-t border-border" : ""}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground truncate">{conv.title}</p>
                                <p className="text-xs text-foreground-secondary truncate mt-0.5">
                                  {conv.lastMessage.replace(/\[\[file:[^\]]+\]\]/g, "").slice(0, 80)}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-foreground-secondary/60 shrink-0">
                                <span className="flex items-center gap-1">
                                  <MessageSquare size={10} />
                                  {conv.messageCount}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock size={10} />
                                  {formatDistanceToNow(new Date(conv.lastTimestamp), { addSuffix: true })}
                                </span>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
