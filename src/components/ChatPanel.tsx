"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowRight, X, Loader2, Trash2, ChevronDown, MessageSquare } from "lucide-react";
import { CodeViewer } from "@/components/CodeViewer";
import { HighlightedCode } from "@/components/HighlightedCode";
import type { ProjectBrief } from "@/lib/types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  brief: ProjectBrief;
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

export function ChatPanel({ brief }: ChatPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [codeViewerOpen, setCodeViewerOpen] = useState(false);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [activeLineEnd, setActiveLineEnd] = useState<number | null>(null);
  const [viewerFiles, setViewerFiles] = useState<string[]>([]);
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
  }, [brief.id]);

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

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
      };

      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      setStreaming(true);

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
            messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
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
              if (parsed.content) {
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
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [input, streaming, messages, brief.id, expanded]
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

  const handleClear = useCallback(() => {
    if (streaming) {
      abortRef.current?.abort();
    }
    setMessages([]);
    setCodeViewerOpen(false);
    setActiveFile(null);
    setActiveLine(null);
    setActiveLineEnd(null);
    setViewerFiles([]);
  }, [streaming]);

  // ─── Markdown renderer with [[file:...]] support ───

  function renderContent(text: string) {
    // Split code blocks first
    const blocks = text.split(/(```\w*\n[\s\S]*?```)/g);
    const elements: React.ReactNode[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const codeMatch = block.match(/^```(\w*)\n([\s\S]*?)```$/);
      if (codeMatch) {
        elements.push(
          <HighlightedCode key={i} code={codeMatch[2]} language={codeMatch[1] || "text"} />
        );
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
      <div className="chat-bar-collapsed">
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "100%",
            maxWidth: 720,
            zIndex: 50,
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

          <div style={{ display: "flex", alignItems: "center", marginTop: 8, paddingLeft: 4 }}>
            <button
              type="button"
              onClick={() => messages.length > 0 && setExpanded(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
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
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.6 }}>
                <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
              </svg>
              RepoRecall
              <ChevronDown size={12} style={{ opacity: 0.5 }} />
            </button>
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
          {messages.length > 0 && (
            <button
              onClick={handleClear}
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
            >
              <Trash2 size={13} />
              Clear
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

      {/* Main area: chat + optional code viewer */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
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

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    marginBottom: 28,
                    animation: "fadeIn 0.2s ease-out",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 600,
                        background:
                          msg.role === "user"
                            ? "var(--foreground)"
                            : "var(--accent)",
                        color: "#fff",
                      }}
                    >
                      {msg.role === "user" ? "Y" : "R"}
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--foreground)",
                      }}
                    >
                      {msg.role === "user" ? "You" : "RepoRecall"}
                    </span>
                  </div>
                  <div
                    style={{
                      paddingLeft: 34,
                      fontSize: 14,
                      lineHeight: 1.75,
                      color: "var(--foreground)",
                      wordBreak: "break-word",
                    }}
                  >
                    {msg.content ? (
                      renderContent(msg.content)
                    ) : streaming && msg.role === "assistant" ? (
                      <span className="chat-thinking-dots">
                        <span /><span /><span />
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
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
                <button
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
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
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.6 }}>
                    <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
                    <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
                    <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
                    <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                  RepoRecall
                  <ChevronDown size={12} style={{ opacity: 0.5 }} />
                </button>
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
