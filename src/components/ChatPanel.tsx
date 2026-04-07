"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowRight, X, Loader2, Trash2, ChevronDown, MessageSquare, History, Clock, Plus } from "lucide-react";
import { CodeViewer } from "@/components/CodeViewer";
import { HighlightedCode } from "@/components/HighlightedCode";
import { MermaidChart } from "@/components/MermaidChart";
import { ChatTraceGroup } from "@/components/ChatTraceGroup";
import type { TraceEvent } from "@/components/ChatTraceGroup";
import type { ProjectBrief } from "@/lib/types";

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

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  traces?: TraceEvent[];
}

interface ChatPanelProps {
  brief: ProjectBrief;
  onNavigateToBrief?: (briefId: string) => void;
  initialSessionId?: string;
}

interface FileRef {
  path: string;
  startLine?: number;
  endLine?: number;
}

// Parse a file reference string like "path/to/file.ts:123" or "path/to/file.ts:10-20"
function parseFileRef(raw: string): FileRef {
  // Match path:startLine-endLine or path:line
  const lineMatch = raw.match(/^(.+?):(\d+)(?:-(\d+))?$/);
  if (lineMatch) {
    return {
      path: lineMatch[1].trim(),
      startLine: parseInt(lineMatch[2], 10),
      endLine: lineMatch[3] ? parseInt(lineMatch[3], 10) : undefined,
    };
  }
  return { path: raw.trim() };
}

// Check if a path looks like a file (has an extension) vs a directory
function looksLikeFile(path: string): boolean {
  const lastSegment = path.split("/").pop() || "";
  return lastSegment.includes(".");
}

// Extract [[file:path]] references from text
function extractFileRefs(text: string): string[] {
  const matches = text.matchAll(/\[\[file:([^\]]+)\]\]/g);
  const files: string[] = [];
  for (const match of matches) {
    const { path } = parseFileRef(match[1]);
    if (!files.includes(path) && looksLikeFile(path)) files.push(path);
  }
  return files;
}

// Extract full FileRef objects (with line info) from text
function extractFullFileRefs(text: string): FileRef[] {
  const matches = text.matchAll(/\[\[file:([^\]]+)\]\]/g);
  const refs: FileRef[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const ref = parseFileRef(match[1]);
    if (!seen.has(match[1]) && looksLikeFile(ref.path)) {
      seen.add(match[1]);
      refs.push(ref);
    }
  }
  return refs;
}

// Get all file refs from all messages
function getAllFileRefs(messages: ChatMessage[]): string[] {
  const files: string[] = [];
  for (const msg of messages) {
    for (const ref of extractFileRefs(msg.content)) {
      if (!files.includes(ref)) files.push(ref);
    }
  }
  return files;
}

// Get the last full FileRef from all messages (with line info)
function getLatestFullRef(messages: ChatMessage[]): FileRef | null {
  let latest: FileRef | null = null;
  for (const msg of messages) {
    const refs = extractFullFileRefs(msg.content);
    if (refs.length > 0) latest = refs[refs.length - 1];
  }
  return latest;
}

function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function ChatMermaidBlock({ chart }: { chart: string }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ margin: "12px 0" }}>
      <button
        onClick={() => setCollapsed((p) => !p)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          borderRadius: "8px 8px " + (collapsed ? "8px 8px" : "0 0"),
          border: "1px solid rgba(55,53,47,0.08)",
          borderBottom: collapsed ? undefined : "none",
          background: "rgba(55,53,47,0.02)",
          color: "rgb(100,99,97)",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          width: "100%",
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.5 }}>
          <path d="M1 3h6v4H1zM9 3h6v4H9zM5 9h6v4H5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M4 7v2M11 7v2M8 7v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        Diagram
      </button>
      {!collapsed && (
        <div style={{ border: "1px solid rgba(55,53,47,0.08)", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
          <MermaidChart chart={chart} className="chat-mermaid" />
        </div>
      )}
    </div>
  );
}

export function ChatPanel({ brief, onNavigateToBrief, initialSessionId }: ChatPanelProps) {
  const [expanded, setExpanded] = useState(!!initialSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [codeViewerOpen, setCodeViewerOpen] = useState(false);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [activeLineEnd, setActiveLineEnd] = useState<number | null>(null);
  const [viewerFiles, setViewerFiles] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());
  const [searchMode, setSearchMode] = useState<"fast" | "deep">("fast");
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [activeTraces, setActiveTraces] = useState<TraceEvent[]>([]);
  const activeTracesRef = useRef<TraceEvent[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
    }
  }, [expanded]);

  useEffect(() => {
    setMessages([]);
    setInput("");
    setStreaming(false);
    setCodeViewerOpen(false);
    setActiveFile(null);
    setActiveLine(null);
    setActiveLineEnd(null);
    setViewerFiles([]);
    setMessagesLoaded(false);
    setSessionId(initialSessionId ?? null);
    if (initialSessionId) setExpanded(true);
  }, [brief.id, initialSessionId]);

  // Load persisted messages from DB when brief or session changes
  useEffect(() => {
    if (messagesLoaded) return;
    let cancelled = false;
    async function loadMessages() {
      try {
        // If we have a sessionId, load that session's messages
        // Otherwise, find the most recent session for this brief
        if (sessionId) {
          const res = await fetch(`/api/chat/messages?briefId=${brief.id}&sessionId=${sessionId}`);
          if (!res.ok || cancelled) return;
          const data = await res.json();
          if (cancelled) return;
          if (data.messages?.length > 0) {
            setMessages(
              data.messages.map((m: { id: string; role: string; content: string }) => ({
                id: m.id,
                role: m.role as "user" | "assistant",
                content: m.content,
              }))
            );
          }
        } else {
          // No session specified — start a fresh chat
          // Users can load previous sessions from the history sidebar
        }
      } catch {
        // Silently fail — user can still start fresh
      } finally {
        if (!cancelled) setMessagesLoaded(true);
      }
    }
    loadMessages();
    return () => { cancelled = true; };
  }, [brief.id, sessionId, messagesLoaded]);

  // Fetch chat history for sidebar
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/chat/history");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Load history when sidebar opens
  useEffect(() => {
    if (historyOpen) fetchHistory();
  }, [historyOpen, fetchHistory]);

  // Auto-open code viewer when new file refs appear in messages
  useEffect(() => {
    const allRefs = getAllFileRefs(messages);
    if (allRefs.length > 0 && expanded) {
      setViewerFiles((prev) => {
        const newFiles = allRefs.filter((f) => !prev.includes(f));
        if (newFiles.length === 0) return prev;
        return [...prev, ...newFiles];
      });
      // Auto-select the latest referenced file, including line info
      const latestRef = getLatestFullRef(messages);
      if (latestRef) {
        setActiveFile(latestRef.path);
        setActiveLine(latestRef.startLine ?? null);
        setActiveLineEnd(latestRef.endLine ?? null);
        setCodeViewerOpen(true);
      }
    }
  }, [messages, expanded]);

  const handleFileRef = useCallback((ref: FileRef) => {
    if (!looksLikeFile(ref.path)) return;
    setViewerFiles((prev) => {
      if (prev.includes(ref.path)) return prev;
      return [...prev, ref.path];
    });
    setActiveFile(ref.path);
    setActiveLine(ref.startLine ?? null);
    setActiveLineEnd(ref.endLine ?? null);
    setCodeViewerOpen(true);
  }, []);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || streaming) return;

      if (!expanded) setExpanded(true);

      // Auto-create a session if we don't have one
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        try {
          const sessRes = await fetch("/api/chat/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ briefId: brief.id, title: trimmed.slice(0, 80) }),
          });
          if (sessRes.ok) {
            const sessData = await sessRes.json();
            currentSessionId = sessData.sessionId;
            setSessionId(currentSessionId);
          }
        } catch {
          // Continue without session — server will use default
        }
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
      };

      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      setStreaming(true);
      setActiveTraces([]);
      activeTracesRef.current = [];

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
      };
      setMessages([...newMessages, assistantMessage]);

      try {
        abortRef.current = new AbortController();
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            briefId: brief.id,
            sessionId: currentSessionId,
            messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
            mode: searchMode,
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Chat request failed");
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "trace") {
                const traceEvent: TraceEvent = { ...parsed, timestamp: Date.now() };
                activeTracesRef.current = [...activeTracesRef.current, traceEvent];
                setActiveTraces(activeTracesRef.current);
              } else if (parsed.type === "error") {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") {
                    updated[updated.length - 1] = { ...last, content: parsed.message || "Something went wrong." };
                  }
                  return updated;
                });
              } else if (parsed.content) {
                accumulated += parsed.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") {
                    updated[updated.length - 1] = { ...last, content: accumulated };
                  }
                  return updated;
                });
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant" && !last.content) {
            updated[updated.length - 1] = {
              ...last,
              content: "Sorry, something went wrong. Please try again.",
            };
          }
          return updated;
        });
      } finally {
        // Attach traces to the assistant message so they persist after streaming ends
        const finalTraces = activeTracesRef.current;
        if (finalTraces.length > 0) {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = { ...last, traces: finalTraces };
            }
            return updated;
          });
        }
        setActiveTraces([]);
        activeTracesRef.current = [];
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [input, streaming, messages, brief.id, expanded, sessionId, searchMode]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleNewChat = useCallback(() => {
    if (streaming) {
      abortRef.current?.abort();
    }
    setMessages([]);
    setSessionId(null);
    setCodeViewerOpen(false);
    setActiveFile(null);
    setActiveLine(null);
    setActiveLineEnd(null);
    setViewerFiles([]);
    setMessagesLoaded(true); // Don't auto-load old messages
    inputRef.current?.focus();
  }, [streaming]);

  const handleDeleteSession = useCallback(async (delSessionId: string) => {
    try {
      await fetch(`/api/chat/sessions?sessionId=${delSessionId}`, { method: "DELETE" });
      // If we deleted the active session, start fresh
      if (delSessionId === sessionId) {
        handleNewChat();
      }
      // Refresh history
      fetchHistory();
    } catch {
      // Silently fail
    }
  }, [sessionId, handleNewChat, fetchHistory]);

  const handleLoadSession = useCallback(async (loadSessionId: string, briefId: string) => {
    if (streaming) return;
    // Navigate to the brief if it's different — pass session via URL
    if (briefId !== brief.id) {
      window.location.href = `/brief/${briefId}?chat=${loadSessionId}`;
      return;
    }
    // Same brief — load session in place
    setSessionId(loadSessionId);
    setMessages([]);
    setMessagesLoaded(false);
    setCodeViewerOpen(false);
    setActiveFile(null);
    setActiveLine(null);
    setActiveLineEnd(null);
    setViewerFiles([]);
    setHistoryOpen(false);
  }, [streaming, brief.id]);

  // ─── Markdown renderer with [[file:...]] support ───

  function renderContent(text: string) {
    // Split code blocks first
    const blocks = text.split(/(```\w*\s*\n[\s\S]*?```)/g);
    const elements: React.ReactNode[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const codeMatch = block.match(/^```(\w*)\s*\n([\s\S]*?)```$/);
      if (codeMatch) {
        const lang = codeMatch[1].toLowerCase();
        if (lang === "mermaid") {
          elements.push(
            <ChatMermaidBlock key={i} chart={codeMatch[2]} />
          );
        } else {
          elements.push(
            <HighlightedCode key={i} code={codeMatch[2]} language={codeMatch[1] || "text"} />
          );
        }
      } else {
        elements.push(<span key={i}>{renderParagraphs(block)}</span>);
      }
    }
    return elements;
  }

  function renderParagraphs(text: string) {
    // Split into paragraphs on double newlines, then process each
    const paragraphs = text.split(/\n{2,}/);
    return paragraphs.map((para, pi) => {
      const trimmed = para.trim();
      if (!trimmed) return null;

      const lines = trimmed.split("\n");

      // Check if this paragraph is a list (all lines start with - or * or 1.)
      const isAllList = lines.every(
        (l) => /^\s*[-*]\s/.test(l) || /^\s*\d+\.\s/.test(l) || l.trim() === ""
      );

      if (isAllList) {
        return (
          <div key={pi} style={{ margin: "6px 0", paddingLeft: 4 }}>
            {lines.map((line, li) => renderListOrLine(line, `${pi}-${li}`))}
          </div>
        );
      }

      // Check if it's a single header
      if (lines.length === 1 && /^#{1,3}\s/.test(lines[0])) {
        return <div key={pi}>{renderBlockLine(lines[0], `${pi}-0`)}</div>;
      }

      // Regular paragraph
      return (
        <p key={pi} style={{ margin: "6px 0" }}>
          {lines.map((line, li) => (
            <span key={li}>
              {renderBlockLine(line, `${pi}-${li}`)}
              {li < lines.length - 1 && <br />}
            </span>
          ))}
        </p>
      );
    });
  }

  function renderListOrLine(text: string, key: string) {
    const trimmed = text.trim();
    if (!trimmed) return null;

    // Numbered list: 1. Item
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      return (
        <div key={key} style={{ display: "flex", gap: 8, padding: "2px 0" }}>
          <span style={{ color: "var(--foreground-secondary)", fontWeight: 500, minWidth: 18, textAlign: "right", flexShrink: 0 }}>
            {numMatch[1]}.
          </span>
          <span style={{ flex: 1 }}>{renderInline(numMatch[2])}</span>
        </div>
      );
    }

    // Bullet list: - Item or * Item
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      return (
        <div key={key} style={{ display: "flex", gap: 8, padding: "2px 0" }}>
          <span style={{ color: "var(--foreground-secondary)", flexShrink: 0, marginTop: 2 }}>
            <svg width="6" height="6" viewBox="0 0 6 6"><circle cx="3" cy="3" r="2.5" fill="currentColor" /></svg>
          </span>
          <span style={{ flex: 1 }}>{renderInline(bulletMatch[1])}</span>
        </div>
      );
    }

    return <div key={key}>{renderInline(trimmed)}</div>;
  }

  function renderBlockLine(text: string, key: string): React.ReactNode {
    // H3
    const h3Match = text.match(/^###\s+(.+)$/);
    if (h3Match) {
      return (
        <span key={key} style={{ fontSize: 14, fontWeight: 600, display: "block", margin: "14px 0 4px" }}>
          {renderInline(h3Match[1])}
        </span>
      );
    }
    // H2
    const h2Match = text.match(/^##\s+(.+)$/);
    if (h2Match) {
      return (
        <span key={key} style={{ fontSize: 15, fontWeight: 600, display: "block", margin: "18px 0 4px" }}>
          {renderInline(h2Match[1])}
        </span>
      );
    }
    // H1
    const h1Match = text.match(/^#\s+(.+)$/);
    if (h1Match) {
      return (
        <span key={key} style={{ fontSize: 16, fontWeight: 700, display: "block", margin: "18px 0 6px" }}>
          {renderInline(h1Match[1])}
        </span>
      );
    }
    // Numbered list inline
    const numMatch = text.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      return (
        <span key={key} style={{ display: "flex", gap: 8, padding: "2px 0" }}>
          <span style={{ color: "var(--foreground-secondary)", fontWeight: 500, minWidth: 18, textAlign: "right", flexShrink: 0 }}>
            {numMatch[1]}.
          </span>
          <span style={{ flex: 1 }}>{renderInline(numMatch[2])}</span>
        </span>
      );
    }
    // Bullet list inline
    const bulletMatch = text.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      return (
        <span key={key} style={{ display: "flex", gap: 8, padding: "2px 0" }}>
          <span style={{ color: "var(--foreground-secondary)", flexShrink: 0, marginTop: 2 }}>
            <svg width="6" height="6" viewBox="0 0 6 6"><circle cx="3" cy="3" r="2.5" fill="currentColor" /></svg>
          </span>
          <span style={{ flex: 1 }}>{renderInline(bulletMatch[1])}</span>
        </span>
      );
    }
    return <span key={key}>{renderInline(text)}</span>;
  }

  function renderInline(text: string): React.ReactNode {
    // Split on [[file:...]] (greedy path with brackets), `code`, and **bold**
    const parts = text.split(/(\[\[file:[^\]]*(?:\[[^\]]*\][^\]]*)*\]\]|`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      // File reference — handle paths with brackets like [...nextauth] and line numbers
      const fileMatch = part.match(/^\[\[file:(.*)\]\]$/);
      if (fileMatch) {
        const ref = parseFileRef(fileMatch[1]);
        const fileName = ref.path.split("/").pop() || ref.path;
        // Directory paths render as plain code, not clickable refs
        if (!looksLikeFile(ref.path)) {
          return (
            <code
              key={i}
              style={{
                background: "#f7f6f3",
                padding: "1px 5px",
                borderRadius: 3,
                fontSize: "0.88em",
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              {ref.path}
            </code>
          );
        }
        const lineLabel = ref.startLine
          ? ref.endLine
            ? `:${ref.startLine}-${ref.endLine}`
            : `:${ref.startLine}`
          : "";
        return (
          <button
            key={i}
            onClick={() => handleFileRef(ref)}
            className="codemap-code-ref"
            style={{ verticalAlign: "baseline", marginLeft: 2, marginRight: 2 }}
          >
            {fileName}
            {lineLabel && (
              <span className="code-ref-line-badge">{lineLabel}</span>
            )}
          </button>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={i}
            style={{
              background: "#f7f6f3",
              padding: "1px 5px",
              borderRadius: 3,
              fontSize: "0.88em",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} style={{ fontWeight: 600 }}>
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  }

  // --- Collapsed bottom bar (DeepWiki style) ---
  if (!expanded) {
    return (
      <div className="chat-bar-collapsed" style={{ flexShrink: 0 }}>
        <div
          style={{
            width: "100%",
            maxWidth: 720,
            margin: "0 auto",
            padding: "0 24px 20px",
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              background: "#ffffff",
              border: "1px solid #e0e0e0",
              borderRadius: 14,
              padding: "8px 8px 8px 18px",
              boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a follow-up question"
              rows={1}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 14,
                color: "var(--foreground)",
                resize: "none",
                lineHeight: 1.5,
                fontFamily: "inherit",
              }}
            />
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "none",
                  background: "var(--surface)",
                  color: "var(--foreground-secondary)",
                  fontSize: 12,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  marginRight: 6,
                }}
              >
                <MessageSquare size={12} />
                {messages.length}
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: 10,
                border: "none",
                background: "transparent",
                color: input.trim() ? "var(--foreground)" : "#ccc",
                cursor: input.trim() ? "pointer" : "default",
                transition: "color 0.15s",
                flexShrink: 0,
              }}
            >
              {streaming ? (
                <Loader2 size={18} className="animate-spin" style={{ color: "var(--foreground-secondary)" }} />
              ) : (
                <ArrowRight size={20} strokeWidth={1.5} />
              )}
            </button>
          </form>

          <div style={{ display: "flex", alignItems: "center", marginTop: 8, paddingLeft: 4, gap: 6 }}>
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setModeDropdownOpen((p) => !p)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "#ffffff",
                  color: "var(--foreground-secondary)",
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: 500,
                }}
                className="sidebar-btn-hover"
              >
                {searchMode === "fast" ? (
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.6 }}>
                    <path d="M9 1L3 9h5l-1 6 6-8H8l1-6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.6 }}>
                    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                )}
                {searchMode === "fast" ? "Fast" : "Deep"}
                <ChevronDown size={11} style={{ opacity: 0.5 }} />
              </button>
              {modeDropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 4px)",
                    left: 0,
                    background: "#fff",
                    border: "1px solid rgba(55,53,47,0.12)",
                    borderRadius: 8,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    padding: 4,
                    zIndex: 60,
                    minWidth: 160,
                  }}
                >
                  <button
                    onClick={() => { setSearchMode("fast"); setModeDropdownOpen(false); }}
                    className="sidebar-btn-hover"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "7px 10px",
                      background: searchMode === "fast" ? "rgba(55,53,47,0.06)" : "none",
                      border: "none",
                      borderRadius: 5,
                      cursor: "pointer",
                      fontSize: 13,
                      color: "rgb(55,53,47)",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M9 1L3 9h5l-1 6 6-8H8l1-6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                    </svg>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontWeight: 500 }}>Fast</div>
                      <div style={{ fontSize: 11, color: "rgb(160,159,156)" }}>Quick responses, fewer files</div>
                    </div>
                  </button>
                  <button
                    onClick={() => { setSearchMode("deep"); setModeDropdownOpen(false); }}
                    className="sidebar-btn-hover"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "7px 10px",
                      background: searchMode === "deep" ? "rgba(55,53,47,0.06)" : "none",
                      border: "none",
                      borderRadius: 5,
                      cursor: "pointer",
                      fontSize: 13,
                      color: "rgb(55,53,47)",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontWeight: 500 }}>Deep</div>
                      <div style={{ fontSize: 11, color: "rgb(160,159,156)" }}>Thorough analysis, more files</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Expanded chat view with optional code viewer split ---
  return (
    <div
      className="chat-panel-expanded"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 24px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setHistoryOpen((p) => !p)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              borderRadius: 6,
              border: "none",
              background: historyOpen ? "rgba(55,53,47,0.06)" : "transparent",
              color: "var(--foreground-secondary)",
              cursor: "pointer",
            }}
            className="sidebar-btn-hover"
            title="Chat history"
          >
            <History size={16} />
          </button>
          <button
            onClick={() => setExpanded(false)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 0",
              border: "none",
              background: "transparent",
              color: "var(--foreground-secondary)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {brief.repoInfo.fullName}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button
            onClick={handleNewChat}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 10px",
              borderRadius: 6,
              border: "none",
              background: "transparent",
              color: "var(--foreground-secondary)",
              fontSize: 12,
              cursor: "pointer",
            }}
            className="sidebar-btn-hover"
            title="Start a new chat"
          >
            <Plus size={13} />
            New Chat
          </button>
          {messages.length > 0 && sessionId && (
            <button
              onClick={() => handleDeleteSession(sessionId)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 10px",
                borderRadius: 6,
                border: "none",
                background: "transparent",
                color: "var(--foreground-secondary)",
                fontSize: 12,
                cursor: "pointer",
              }}
              className="sidebar-btn-hover"
              title="Delete this chat"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={() => setExpanded(false)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              borderRadius: 6,
              border: "none",
              background: "transparent",
              color: "var(--foreground-secondary)",
              cursor: "pointer",
            }}
            className="sidebar-btn-hover"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Main area: history sidebar + chat + optional code viewer */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Chat history sidebar — sessions grouped by repo */}
        {historyOpen && (
          <div
            style={{
              width: 280,
              flexShrink: 0,
              borderRight: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              backgroundColor: "#fbfbfa",
              animation: "fadeIn 0.15s ease-out",
            }}
          >
            <div
              style={{
                padding: "14px 16px 10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "rgb(120,119,116)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Chat History
              </span>
              <button
                onClick={handleNewChat}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 8px",
                  borderRadius: 5,
                  border: "none",
                  background: "none",
                  color: "rgb(120,119,116)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
                className="sidebar-btn-hover"
                title="Start a new chat"
              >
                <Plus size={12} />
                New
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
              {historyLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                  <Loader2 size={16} className="animate-spin" style={{ color: "rgb(160,159,156)" }} />
                </div>
              ) : conversations.length === 0 ? (
                <div
                  style={{
                    padding: "24px 8px",
                    textAlign: "center",
                    fontSize: 13,
                    color: "rgb(160,159,156)",
                  }}
                >
                  No chat history yet
                </div>
              ) : (
                (() => {
                  // Group conversations by repo
                  const repoGroups = new Map<string, { repoName: string; briefId: string; sessions: ChatConversation[] }>();
                  for (const conv of conversations) {
                    const key = conv.briefId;
                    if (!repoGroups.has(key)) {
                      repoGroups.set(key, { repoName: conv.repoName, briefId: conv.briefId, sessions: [] });
                    }
                    repoGroups.get(key)!.sessions.push(conv);
                  }

                  return Array.from(repoGroups.values()).map((group) => {
                    const isCurrentRepo = group.briefId === brief.id;
                    const isExpanded = expandedRepos.has(group.briefId) || isCurrentRepo;
                    return (
                      <div key={group.briefId} style={{ marginBottom: 4 }}>
                        {/* Repo folder header */}
                        <button
                          onClick={() => {
                            setExpandedRepos((prev) => {
                              const next = new Set(prev);
                              if (next.has(group.briefId)) {
                                next.delete(group.briefId);
                              } else {
                                next.add(group.briefId);
                              }
                              return next;
                            });
                          }}
                          className="sidebar-btn-hover"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            width: "100%",
                            padding: "6px 8px",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            borderRadius: 5,
                            fontSize: 12,
                            fontWeight: 600,
                            color: isCurrentRepo ? "rgb(55,53,47)" : "rgb(100,99,97)",
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, opacity: 0.5 }}>
                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                          </svg>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "left" }}>
                            {group.repoName}
                          </span>
                          <span style={{ fontSize: 10, color: "rgb(180,179,176)", flexShrink: 0 }}>
                            {group.sessions.length}
                          </span>
                        </button>

                        {/* Session list within repo */}
                        {isExpanded && (
                          <div style={{ paddingLeft: 12 }}>
                            {group.sessions.map((conv) => {
                              const isActive = conv.sessionId === sessionId;
                              const preview =
                                conv.lastRole === "user"
                                  ? conv.lastMessage
                                  : conv.lastMessage.replace(/\[\[file:[^\]]+\]\]/g, "").trim();
                              const timeAgo = formatTimeAgo(conv.lastTimestamp);
                              return (
                                <div
                                  key={conv.sessionId}
                                  style={{ position: "relative" }}
                                  className="chat-history-item"
                                >
                                  <button
                                    onClick={() => handleLoadSession(conv.sessionId, conv.briefId)}
                                    className="sidebar-btn-hover"
                                    style={{
                                      display: "block",
                                      width: "100%",
                                      padding: "8px 10px",
                                      background: isActive ? "rgba(55,53,47,0.06)" : "none",
                                      border: "none",
                                      cursor: "pointer",
                                      borderRadius: 5,
                                      textAlign: "left",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: 13,
                                        fontWeight: isActive ? 500 : 400,
                                        color: isActive ? "rgb(55,53,47)" : "rgb(100,99,97)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        marginBottom: 3,
                                      }}
                                    >
                                      {conv.title}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        color: "rgb(160,159,156)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        marginBottom: 4,
                                        lineHeight: 1.4,
                                      }}
                                    >
                                      {preview.slice(0, 60)}
                                      {preview.length > 60 ? "…" : ""}
                                    </div>
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        fontSize: 11,
                                        color: "rgb(180,179,176)",
                                      }}
                                    >
                                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                        <MessageSquare size={10} />
                                        {conv.messageCount}
                                      </span>
                                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                        <Clock size={10} />
                                        {timeAgo}
                                      </span>
                                    </div>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteSession(conv.sessionId);
                                    }}
                                    className="sidebar-btn-hover chat-history-delete"
                                    style={{
                                      position: "absolute",
                                      top: 8,
                                      right: 6,
                                      width: 22,
                                      height: 22,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      borderRadius: 4,
                                      border: "none",
                                      background: "none",
                                      color: "rgb(180,179,176)",
                                      cursor: "pointer",
                                      opacity: 0,
                                      transition: "opacity 0.15s",
                                    }}
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
        )}

        {/* Chat messages + input */}
        <div
          style={{
            flex: codeViewerOpen ? "0 0 50%" : "1",
            maxWidth: codeViewerOpen ? "50%" : "100%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            transition: "flex 0.2s ease",
          }}
        >
          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 0",
            }}
          >
            <div style={{ maxWidth: codeViewerOpen ? "none" : 720, margin: "0 auto", padding: "0 24px" }}>
              {messages.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "80px 20px",
                    color: "var(--foreground-secondary)",
                  }}
                >
                  <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 6, color: "var(--foreground)" }}>
                    Ask anything about {brief.repoInfo.name}
                  </p>
                  <p style={{ fontSize: 13, opacity: 0.6 }}>
                    Referenced files will open in a code viewer
                  </p>
                </div>
              )}

              {messages.map((msg) => {
                const isLastAssistant =
                  msg.role === "assistant" &&
                  messages[messages.length - 1]?.id === msg.id;
                const msgTraces = isLastAssistant && streaming
                  ? activeTraces
                  : msg.traces;
                const hasTraces = msgTraces && msgTraces.length > 0;

                return (
                  <div
                    key={msg.id}
                    style={{
                      marginBottom: 32,
                      animation: "fadeIn 0.2s ease-out",
                    }}
                  >
                    {msg.role === "user" ? (
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 600,
                          lineHeight: 1.35,
                          color: "var(--foreground)",
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {msg.content}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 14,
                          lineHeight: 1.75,
                          color: "var(--foreground)",
                          wordBreak: "break-word",
                        }}
                      >
                        {hasTraces && (
                          <ChatTraceGroup
                            traces={msgTraces!}
                            isStreaming={isLastAssistant && streaming && !msg.content}
                            defaultExpanded={isLastAssistant && streaming}
                          />
                        )}
                        {msg.content ? (
                          renderContent(msg.content)
                        ) : streaming && isLastAssistant ? (
                          !hasTraces && (
                            <span className="chat-thinking-dots">
                              <span /><span /><span />
                            </span>
                          )
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input */}
          <div style={{ padding: "16px 24px 20px", flexShrink: 0 }}>
            <form
              onSubmit={handleSubmit}
              style={{
                maxWidth: codeViewerOpen ? "none" : 720,
                margin: "0 auto",
                display: "flex",
                alignItems: "flex-end",
                gap: 0,
                border: "1px solid #e0e0e0",
                borderRadius: 14,
                padding: "8px 8px 8px 18px",
                background: "#ffffff",
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a follow-up question"
                rows={1}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: 14,
                  color: "var(--foreground)",
                  resize: "none",
                  lineHeight: 1.5,
                  fontFamily: "inherit",
                  maxHeight: 120,
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = Math.min(target.scrollHeight, 120) + "px";
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || streaming}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  border: "none",
                  background: "transparent",
                  color: input.trim() ? "var(--foreground)" : "#ccc",
                  cursor: input.trim() ? "pointer" : "default",
                  transition: "color 0.15s",
                  flexShrink: 0,
                }}
              >
                {streaming ? (
                  <Loader2 size={18} className="animate-spin" style={{ color: "var(--foreground-secondary)" }} />
                ) : (
                  <ArrowRight size={20} strokeWidth={1.5} />
                )}
              </button>
            </form>
            <div style={{ maxWidth: codeViewerOpen ? "none" : 720, margin: "0 auto" }}>
              <div style={{ display: "flex", alignItems: "center", marginTop: 8, paddingLeft: 2 }}>
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => setModeDropdownOpen((p) => !p)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "4px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "#ffffff",
                      color: "var(--foreground-secondary)",
                      fontSize: 13,
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                    className="sidebar-btn-hover"
                  >
                    {searchMode === "fast" ? (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.6 }}>
                        <path d="M9 1L3 9h5l-1 6 6-8H8l1-6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.6 }}>
                        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                        <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                      </svg>
                    )}
                    {searchMode === "fast" ? "Fast" : "Deep"}
                    <ChevronDown size={11} style={{ opacity: 0.5 }} />
                  </button>
                  {modeDropdownOpen && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "calc(100% + 4px)",
                        left: 0,
                        background: "#fff",
                        border: "1px solid rgba(55,53,47,0.12)",
                        borderRadius: 8,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                        padding: 4,
                        zIndex: 60,
                        minWidth: 160,
                      }}
                    >
                      <button
                        onClick={() => { setSearchMode("fast"); setModeDropdownOpen(false); }}
                        className="sidebar-btn-hover"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          padding: "7px 10px",
                          background: searchMode === "fast" ? "rgba(55,53,47,0.06)" : "none",
                          border: "none",
                          borderRadius: 5,
                          cursor: "pointer",
                          fontSize: 13,
                          color: "rgb(55,53,47)",
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <path d="M9 1L3 9h5l-1 6 6-8H8l1-6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                        </svg>
                        <div style={{ textAlign: "left" }}>
                          <div style={{ fontWeight: 500 }}>Fast</div>
                          <div style={{ fontSize: 11, color: "rgb(160,159,156)" }}>Quick responses, fewer files</div>
                        </div>
                      </button>
                      <button
                        onClick={() => { setSearchMode("deep"); setModeDropdownOpen(false); }}
                        className="sidebar-btn-hover"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          padding: "7px 10px",
                          background: searchMode === "deep" ? "rgba(55,53,47,0.06)" : "none",
                          border: "none",
                          borderRadius: 5,
                          cursor: "pointer",
                          fontSize: 13,
                          color: "rgb(55,53,47)",
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                          <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                        </svg>
                        <div style={{ textAlign: "left" }}>
                          <div style={{ fontWeight: 500 }}>Deep</div>
                          <div style={{ fontSize: 11, color: "rgb(160,159,156)" }}>Thorough analysis, more files</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Code viewer panel (right side) */}
        {codeViewerOpen && (
          <div
            style={{
              flex: "0 0 50%",
              maxWidth: "50%",
              borderLeft: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              animation: "fadeIn 0.2s ease-out",
            }}
          >
            <CodeViewer
              owner={brief.repoInfo.owner}
              repo={brief.repoInfo.name}
              files={viewerFiles}
              activeFile={activeFile}
              activeLine={activeLine}
              activeLineEnd={activeLineEnd}
              onFileSelect={(path) => {
                setActiveFile(path);
                setActiveLine(null);
                setActiveLineEnd(null);
              }}
              onClose={() => setCodeViewerOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
