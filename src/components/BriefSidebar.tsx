"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { ProjectBrief } from "@/lib/types";

interface SidebarConversation {
  sessionId: string;
  briefId: string;
  title: string;
  repoName: string;
  lastMessage: string;
  lastTimestamp: string;
  messageCount: number;
}

function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

// ─── Inline SVG Icons (Notion-style, thin stroke) ───
function IconLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="16" height="16" rx="4" fill="#2F2F2F" />
      <path d="M7 6h6M7 10h4M7 14h5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconChevronRight({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronDown({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconGitHub() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function IconSidebar() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 2.5v11" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconFileText() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M9.5 1.5H4A1.5 1.5 0 002.5 3v10A1.5 1.5 0 004 14.5h8a1.5 1.5 0 001.5-1.5V5.5L9.5 1.5z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.5 1.5V5.5h4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 8h5M5.5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 8l6 3 6-3M2 11l6 3 6-3M2 5l6 3 6-3-6-3-6 3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function IconBox() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 5l6-3 6 3v6l-6 3-6-3V5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M2 5l6 3m0 0v6m0-6l6-3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconBriefcase() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="5" width="13" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 5V3.5a1 1 0 011-1h3a1 1 0 011 1V5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="0.8" fill="currentColor" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconCreditCard() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function IconLogOut() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 14H3.5A1.5 1.5 0 012 12.5v-9A1.5 1.5 0 013.5 2H6M11 11l3-3-3-3M5.5 8H14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCodemap() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.25 4h0M11.75 4h0M4.25 11.5h0M11.75 11.5h0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconDashboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="5" height="7" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9.5" y="1.5" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.5" y="10.5" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9.5" y="7.5" width="5" height="7" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H5l-3 3V3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5 6h6M5 8.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ─── Section definitions ───
const briefSections = [
  { id: "overview", icon: IconFileText, label: "Overview" },
  { id: "codemap", icon: IconCodemap, label: "Codemap" },
  { id: "features", icon: IconLayers, label: "Features" },
  { id: "architecture", icon: IconBox, label: "Architecture" },
  { id: "timeline", icon: IconClock, label: "Timeline" },
  { id: "business", icon: IconBriefcase, label: "Business Context" },
  { id: "entrypoints", icon: IconTarget, label: "Where to Start" },
];

// ─── Types ───
interface BriefSidebarProps {
  activeSection: string;
  onSectionChange: (id: string) => void;
  brief: ProjectBrief;
  allBriefs?: ProjectBrief[];
  onRepoSelect?: (id: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onConnectNew?: () => void;
  onOpenChat?: (sessionId: string, briefId: string) => void;
  isPublic?: boolean;
}

// ─── Sidebar Component ───
export function BriefSidebar({
  activeSection,
  onSectionChange,
  brief,
  allBriefs = [],
  onRepoSelect,
  collapsed = false,
  onToggleCollapse,
  onConnectNew,
  onOpenChat,
  isPublic = false,
}: BriefSidebarProps) {
  const [reposOpen, setReposOpen] = useState(true);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [chatConversations, setChatConversations] = useState<SidebarConversation[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [expandedChatRepos, setExpandedChatRepos] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchChats = useCallback(async () => {
    setChatsLoading(true);
    try {
      const res = await fetch("/api/chat/history");
      if (res.ok) {
        const data = await res.json();
        setChatConversations(
          (data.conversations ?? []).map((c: Record<string, unknown>) => ({
            sessionId: c.sessionId,
            briefId: c.briefId,
            title: c.title,
            repoName: c.repoName,
            lastMessage: c.lastMessage,
            lastTimestamp: c.lastTimestamp,
            messageCount: c.messageCount,
          }))
        );
      }
    } catch {
      // silently fail
    } finally {
      setChatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (chatsOpen && chatConversations.length === 0) fetchChats();
  }, [chatsOpen, chatConversations.length, fetchChats]);

  // Safety guard — brief may be undefined during hot-reload
  if (!brief?.repoInfo) return null;

  // Collapsed state — show icons only
  if (collapsed) {
    return (
      <div
        style={{
          width: 48,
          height: "100vh",
          backgroundColor: "#fbfbfa",
          borderRight: "1px solid rgba(55,53,47,0.09)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 10,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {/* Toggle */}
        <button
          onClick={onToggleCollapse}
          title="Expand sidebar"
          className="sidebar-btn-subtle"
          style={{
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            cursor: "pointer",
            borderRadius: 4,
            color: "rgb(120,119,116)",
            marginBottom: 8,
          }}
        >
          <IconSidebar />
        </button>

        {/* Dashboard */}
        <a
          href="/briefs"
          title="Dashboard"
          className="sidebar-btn-hover"
          style={{
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            cursor: "pointer",
            borderRadius: 4,
            color: "rgb(160,159,156)",
            textDecoration: "none",
            marginBottom: 4,
          }}
        >
          <IconDashboard />
        </a>

        {/* Repos */}
        {allBriefs.map((b) => {
          const isActive = b.id === brief.id;
          return (
            <button
              key={b.id}
              onClick={() => onRepoSelect?.(b.id)}
              title={b.repoInfo.name}
              className="sidebar-btn-hover"
              style={{
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isActive ? "rgba(55,53,47,0.06)" : "none",
                border: "none",
                cursor: "pointer",
                borderRadius: 4,
                color: isActive ? "rgb(55,53,47)" : "rgb(160,159,156)",
              }}
            >
              <IconGitHub />
            </button>
          );
        })}
        {allBriefs.length === 0 && (
          <div
            title={brief.repoInfo.name}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(55,53,47,0.06)",
              borderRadius: 4,
              color: "rgb(55,53,47)",
            }}
          >
            <IconGitHub />
          </div>
        )}
        <button
          onClick={onConnectNew}
          title="Connect repo"
          className="sidebar-btn-hover"
          style={{
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            cursor: "pointer",
            borderRadius: 4,
            color: "rgb(160,159,156)",
          }}
        >
          <IconPlus />
        </button>

        {/* Divider */}
        <div
          style={{
            width: 20,
            height: 1,
            backgroundColor: "rgba(55,53,47,0.09)",
            margin: "6px 0",
          }}
        />

        {/* Brief sections */}
        {briefSections.map((s) => {
          const Icon = s.icon;
          const isActive = activeSection === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onSectionChange(s.id)}
              title={s.label}
              className="sidebar-btn-hover"
              style={{
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isActive ? "rgba(55,53,47,0.06)" : "none",
                border: "none",
                cursor: "pointer",
                borderRadius: 4,
                color: isActive ? "rgb(55,53,47)" : "rgb(160,159,156)",
              }}
            >
              <Icon />
            </button>
          );
        })}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* User avatar */}
        <SidebarUserMenu collapsed />
      </div>
    );
  }

  return (
    <div
      style={{
        width: 240,
        height: "100vh",
        backgroundColor: "#fbfbfa",
        borderRight: "1px solid rgba(55,53,47,0.09)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 12px 4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IconLogo />
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "rgb(55,53,47)",
              letterSpacing: "-0.02em",
            }}
          >
            RepoRecall
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <a
            href="/briefs"
            title="Dashboard"
            className="sidebar-btn-subtle"
            style={{
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              borderRadius: 4,
              color: "rgb(160,159,156)",
              textDecoration: "none",
            }}
          >
            <IconDashboard />
          </a>
          <button
            onClick={onToggleCollapse}
            className="sidebar-btn-subtle"
            style={{
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              borderRadius: 4,
              color: "rgb(160,159,156)",
            }}
          >
            <IconSidebar />
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: "8px 12px" }}>
        {searchOpen ? (
          <div style={{ position: "relative" }}>
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchOpen(false);
                  setSearchQuery("");
                }
              }}
              placeholder="Filter briefs & sections…"
              style={{
                width: "100%",
                padding: "5px 8px 5px 28px",
                borderRadius: 4,
                border: "1px solid rgba(55,53,47,0.16)",
                fontSize: 13,
                outline: "none",
                color: "rgb(55,53,47)",
                backgroundColor: "#fff",
              }}
            />
            <span style={{ position: "absolute", left: 8, top: 7, color: "rgb(160,159,156)" }}>
              <IconSearch />
            </span>
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="sidebar-btn-hover"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 8px",
              borderRadius: 4,
              color: "rgb(160,159,156)",
              fontSize: 13,
              cursor: "pointer",
              width: "100%",
              background: "none",
              border: "none",
            }}
          >
            <IconSearch />
            <span>Search</span>
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
        {/* Repos section */}
        <button
          onClick={() => setReposOpen((p) => !p)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            width: "100%",
            padding: "4px 6px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
            color: "rgb(120,119,116)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {reposOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
          Repos
        </button>

        {reposOpen && (
          <div style={{ paddingLeft: 4, marginBottom: 8 }}>
            {allBriefs.filter((b) =>
              !searchQuery || b.repoInfo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              b.repoInfo.owner.toLowerCase().includes(searchQuery.toLowerCase())
            ).map((b) => {
              const isActive = b.id === brief.id;
              return (
                <button
                  key={b.id}
                  onClick={() => onRepoSelect?.(b.id)}
                  className="sidebar-btn-hover"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "5px 8px",
                    background: isActive ? "rgba(55,53,47,0.06)" : "none",
                    border: "none",
                    cursor: "pointer",
                    borderRadius: 4,
                    fontSize: 13,
                    color: isActive ? "rgb(55,53,47)" : "rgb(100,99,97)",
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  <IconGitHub />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                      textAlign: "left",
                    }}
                  >
                    {b.repoInfo.name}
                  </span>
                  {b.repoInfo.isPrivate && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        backgroundColor: "rgb(217,115,13)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                </button>
              );
            })}

            {/* Show current brief if not in allBriefs */}
            {allBriefs.length === 0 && (
              <button
                className="sidebar-btn-hover"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "5px 8px",
                  background: "rgba(55,53,47,0.06)",
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 4,
                  fontSize: 13,
                  color: "rgb(55,53,47)",
                  fontWeight: 500,
                }}
              >
                <IconGitHub />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    textAlign: "left",
                  }}
                >
                  {brief.repoInfo.name}
                </span>
              </button>
            )}

            {!isPublic && (
            <button
              onClick={onConnectNew}
              className="sidebar-btn-hover"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                padding: "5px 8px",
                background: "none",
                border: "none",
                cursor: "pointer",
                borderRadius: 4,
                fontSize: 13,
                color: "rgb(160,159,156)",
              }}
            >
              <IconPlus />
              <span>Connect repo</span>
            </button>
            )}
          </div>
        )}

        {/* Divider */}
        <div
          style={{
            height: 1,
            backgroundColor: "rgba(55,53,47,0.06)",
            margin: "4px 6px",
          }}
        />

        {/* Brief sections */}
        <div style={{ padding: "6px 0" }}>
          <div
            style={{
              padding: "4px 6px",
              fontSize: 12,
              fontWeight: 500,
              color: "rgb(120,119,116)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Brief
          </div>
          {briefSections.filter((s) =>
            !searchQuery || s.label.toLowerCase().includes(searchQuery.toLowerCase())
          ).map((s) => {
            const Icon = s.icon;
            const isActive = activeSection === s.id;

            return (
              <button
                key={s.id}
                onClick={() => onSectionChange(s.id)}
                className="sidebar-btn-hover"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "5px 8px",
                  background: isActive ? "rgba(55,53,47,0.06)" : "none",
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 4,
                  fontSize: 13,
                  color: isActive ? "rgb(55,53,47)" : "rgb(100,99,97)",
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                <span
                  style={{
                    color: isActive ? "rgb(55,53,47)" : "rgb(160,159,156)",
                  }}
                >
                  <Icon />
                </span>
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            backgroundColor: "rgba(55,53,47,0.06)",
            margin: "4px 6px",
          }}
        />

        {/* Chats section (hidden for public/explore view) */}
        {isPublic ? (
          <div style={{ padding: "12px 8px" }}>
            <a
              href="/login"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                width: "100%",
                padding: "8px 12px",
                background: "rgb(55,53,47)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Sign in with GitHub
            </a>
            <p style={{ fontSize: 11, color: "rgb(160,159,156)", textAlign: "center", marginTop: 6, lineHeight: 1.4 }}>
              Chat, analyze your own repos, and more
            </p>
          </div>
        ) : (
        <div style={{ padding: "6px 0" }}>
          <button
            onClick={() => setChatsOpen((p) => !p)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              width: "100%",
              padding: "4px 6px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
              color: "rgb(120,119,116)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {chatsOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
            Chats
          </button>

          {chatsOpen && (
            <div style={{ paddingLeft: 4, marginTop: 2 }}>
              {chatsLoading ? (
                <div style={{ padding: "8px 8px", fontSize: 12, color: "rgb(160,159,156)" }}>
                  Loading…
                </div>
              ) : chatConversations.length === 0 ? (
                <div style={{ padding: "8px 8px", fontSize: 12, color: "rgb(160,159,156)" }}>
                  No conversations yet
                </div>
              ) : (
                (() => {
                  const repoGroups = new Map<string, { repoName: string; briefId: string; sessions: SidebarConversation[] }>();
                  for (const conv of chatConversations) {
                    const key = conv.briefId;
                    if (!repoGroups.has(key)) {
                      repoGroups.set(key, { repoName: conv.repoName, briefId: conv.briefId, sessions: [] });
                    }
                    repoGroups.get(key)!.sessions.push(conv);
                  }

                  return Array.from(repoGroups.values()).map((group) => {
                    const isCurrentRepo = group.briefId === brief.id;
                    const isExpanded = expandedChatRepos.has(group.briefId) || isCurrentRepo;
                    return (
                      <div key={group.briefId} style={{ marginBottom: 2 }}>
                        <button
                          onClick={() => {
                            setExpandedChatRepos((prev) => {
                              const next = new Set(prev);
                              if (next.has(group.briefId)) next.delete(group.briefId);
                              else next.add(group.briefId);
                              return next;
                            });
                          }}
                          className="sidebar-btn-hover"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            width: "100%",
                            padding: "4px 8px",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            color: isCurrentRepo ? "rgb(55,53,47)" : "rgb(100,99,97)",
                          }}
                        >
                          <span style={{ flexShrink: 0, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", display: "flex" }}>
                            <IconChevronRight size={10} />
                          </span>
                          <IconGitHub />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "left" }}>
                            {group.repoName}
                          </span>
                          <span style={{ fontSize: 10, color: "rgb(180,179,176)", flexShrink: 0 }}>
                            {group.sessions.length}
                          </span>
                        </button>

                        {isExpanded && (
                          <div style={{ paddingLeft: 16 }}>
                            {group.sessions.map((conv) => (
                              <button
                                key={conv.sessionId}
                                onClick={() => {
                                  if (group.briefId !== brief.id) {
                                    onRepoSelect?.(group.briefId);
                                  }
                                  onOpenChat?.(conv.sessionId, group.briefId);
                                }}
                                className="sidebar-btn-hover"
                                style={{
                                  display: "block",
                                  width: "100%",
                                  padding: "5px 8px",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  borderRadius: 4,
                                  textAlign: "left",
                                }}
                              >
                                <div style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}>
                                  <span style={{ flexShrink: 0, color: "rgb(160,159,156)" }}>
                                    <IconChat />
                                  </span>
                                  <span style={{
                                    fontSize: 12,
                                    color: "rgb(100,99,97)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    flex: 1,
                                  }}>
                                    {conv.title}
                                  </span>
                                  <span style={{ fontSize: 10, color: "rgb(180,179,176)", flexShrink: 0 }}>
                                    {formatTimeAgo(conv.lastTimestamp)}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()
              )}
            </div>
          )}
        </div>
        )}

        {/* Divider */}
        <div
          style={{
            height: 1,
            backgroundColor: "rgba(55,53,47,0.06)",
            margin: "4px 6px",
          }}
        />

        {/* Info section */}
        <div style={{ padding: "6px 0" }}>
          <div
            style={{
              padding: "4px 6px",
              fontSize: 12,
              fontWeight: 500,
              color: "rgb(120,119,116)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Repository
          </div>
          <div
            style={{
              padding: "8px 8px",
              fontSize: 12,
              color: "rgb(120,119,116)",
              lineHeight: 1.6,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span>Language</span>
              <span style={{ color: "rgb(55,53,47)", fontWeight: 500 }}>
                {brief.repoInfo.language || "Multiple"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span>Stars</span>
              <span style={{ color: "rgb(55,53,47)", fontWeight: 500 }}>
                {brief.repoInfo.stars}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span>Features</span>
              <span style={{ color: "rgb(55,53,47)", fontWeight: 500 }}>
                {brief.features.length}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Milestones</span>
              <span style={{ color: "rgb(55,53,47)", fontWeight: 500 }}>
                {brief.timeline.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer — user profile */}
      <SidebarUserMenu />
    </div>
  );
}

// ─── Sidebar User Menu ───
function SidebarUserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  if (!user) return null;

  const avatar = user.user_metadata?.avatar_url;
  const name =
    user.user_metadata?.full_name ||
    user.user_metadata?.user_name ||
    user.email;
  const email = user.email;

  if (collapsed) {
    return (
      <div ref={ref} style={{ position: "relative", marginBottom: 10 }}>
        <button
          onClick={() => setOpen(!open)}
          title={name ?? "Account"}
          className="sidebar-btn-hover"
          style={{
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: open ? "rgba(55,53,47,0.06)" : "none",
            border: "none",
            cursor: "pointer",
            borderRadius: "50%",
            padding: 0,
            overflow: "hidden",
          }}
        >
          {avatar ? (
            <img src={avatar} alt="" width={28} height={28} style={{ borderRadius: "50%" }} />
          ) : (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                backgroundColor: "rgba(55,53,47,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 600,
                color: "rgb(55,53,47)",
              }}
            >
              {(name ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
        </button>

        {open && (
          <SidebarUserDropdown
            name={name}
            email={email}
            onSignOut={handleSignOut}
            onClose={() => setOpen(false)}
            style={{ left: 44, bottom: 0 }}
          />
        )}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        className="sidebar-btn-hover"
        style={{
          width: "100%",
          padding: "10px 16px",
          borderTop: "1px solid rgba(55,53,47,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "rgb(100,99,97)",
          background: open ? "rgba(55,53,47,0.04)" : "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        {avatar ? (
          <img
            src={avatar}
            alt=""
            width={24}
            height={24}
            style={{ borderRadius: "50%", flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              backgroundColor: "rgba(55,53,47,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 600,
              color: "rgb(55,53,47)",
              flexShrink: 0,
            }}
          >
            {(name ?? "?").charAt(0).toUpperCase()}
          </div>
        )}
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </span>
      </button>

      {open && (
        <SidebarUserDropdown
          name={name}
          email={email}
          onSignOut={handleSignOut}
          onClose={() => setOpen(false)}
          style={{ left: 0, bottom: "100%", marginBottom: 4 }}
        />
      )}
    </div>
  );
}

function SidebarUserDropdown({
  name,
  email,
  onSignOut,
  onClose,
  style,
}: {
  name: string | null | undefined;
  email: string | undefined;
  onSignOut: () => void;
  onClose: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        position: "absolute",
        width: 220,
        backgroundColor: "#fff",
        border: "1px solid rgba(55,53,47,0.12)",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.06)",
        zIndex: 100,
        padding: "4px 0",
        ...style,
      }}
    >
      {/* User info */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid rgba(55,53,47,0.06)",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "rgb(55,53,47)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "rgb(120,119,116)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginTop: 2,
          }}
        >
          {email}
        </div>
      </div>

      {/* Settings */}
      <a
        href="/settings"
        onClick={onClose}
        className="sidebar-btn-hover"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 14px",
          fontSize: 13,
          color: "rgb(100,99,97)",
          textDecoration: "none",
          cursor: "pointer",
        }}
      >
        <IconSettings />
        Settings
      </a>

      {/* Billing */}
      <a
        href="/billing"
        onClick={onClose}
        className="sidebar-btn-hover"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 14px",
          fontSize: 13,
          color: "rgb(100,99,97)",
          textDecoration: "none",
          cursor: "pointer",
        }}
      >
        <IconCreditCard />
        Billing
      </a>

      {/* Sign out */}
      <button
        onClick={onSignOut}
        className="sidebar-btn-hover"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "7px 14px",
          fontSize: 13,
          color: "rgb(100,99,97)",
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        <IconLogOut />
        Sign out
      </button>
    </div>
  );
}
