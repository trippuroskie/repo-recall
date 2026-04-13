"use client";

import { useState, useEffect, useRef } from "react";
import type { ProjectBrief } from "@/lib/types";

interface ProgressEvent {
  type: "step" | "finding" | "progress" | "complete" | "error";
  action?: string;
  detail?: string;
  status?: "started" | "done";
  category?: string;
  summary?: string;
  phase?: string;
  current?: number;
  total?: number;
  cycle?: number;
  totalCycles?: number;
  brief?: ProjectBrief;
  message?: string;
}

interface LogEntry {
  id: number;
  text: string;
  type: "step" | "finding" | "error" | "info";
  done?: boolean;
}

function IconLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="16" height="16" rx="4" fill="#2F2F2F" />
      <path
        d="M7 6h6M7 10h4M7 14h5"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AnalysisProgress({
  repoUrl,
  token,
  depth,
  onComplete,
  onError,
}: {
  repoUrl: string;
  token?: string;
  depth?: "standard" | "deep";
  onComplete: (brief: ProjectBrief) => void;
  onError: (message: string) => void;
}) {
  const [phase, setPhase] = useState("Connecting...");
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(3);
  const [cycle, setCycle] = useState<number | undefined>(undefined);
  const [totalCycles, setTotalCycles] = useState<number | undefined>(undefined);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filesRead, setFilesRead] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    const controller = new AbortController();

    async function runAnalysis() {
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoUrl: repoUrl.trim(),
            token: token?.trim() || undefined,
            depth: depth === "deep" ? "deep" : undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json();
          onError(data.error || "Analysis failed");
          return;
        }

        // Handle duplicate repo — API returns JSON instead of SSE stream
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await res.json();
          if (data.existing && data.brief) {
            onComplete(data.brief);
            return;
          }
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        let receivedComplete = false;

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
              const event: ProgressEvent = JSON.parse(data);
              if (event.type === "complete") receivedComplete = true;
              handleEvent(event);
            } catch {
              // Skip malformed events
            }
          }
        }

        // If the stream ended without a complete event, the connection may have
        // dropped but the server might still be saving the brief. Poll for it.
        if (!receivedComplete) {
          const repoName = extractRepoName(repoUrl);
          if (repoName) {
            setPhase("Connection lost — checking for saved results...");
            const brief = await pollForBrief(repoName);
            if (brief) {
              onComplete(brief);
              return;
            }
          }
          onError("Analysis ended unexpectedly. Please try again.");
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        // Connection may have died (ECONNRESET, network error) but server
        // might still finish and save the brief. Poll before giving up.
        const repoName = extractRepoName(repoUrl);
        if (repoName) {
          setPhase("Connection lost — checking for saved results...");
          const brief = await pollForBrief(repoName);
          if (brief) {
            onComplete(brief);
            return;
          }
        }
        onError(err instanceof Error ? err.message : "Analysis failed");
      }
    }

    function handleEvent(event: ProgressEvent) {
      switch (event.type) {
        case "progress":
          setPhase(event.phase || "Working...");
          setProgress(event.current || 0);
          setTotal(event.total || 3);
          if (typeof event.cycle === "number") setCycle(event.cycle);
          if (typeof event.totalCycles === "number") setTotalCycles(event.totalCycles);
          break;

        case "step":
          if (event.status === "started") {
            const label = formatAction(event.action || "", event.detail || "");
            setLogs((prev) => [
              ...prev,
              { id: nextId.current++, text: label, type: "step" },
            ]);
          }
          if (
            event.status === "done" &&
            (event.action === "readFile" || event.action === "readFileLines")
          ) {
            setFilesRead((prev) => prev + 1);
            // Mark the last matching entry as done
            setLogs((prev) => {
              const idx = [...prev]
                .reverse()
                .findIndex(
                  (l) => l.type === "step" && !l.done && l.text.includes(event.detail || "")
                );
              if (idx === -1) return prev;
              const realIdx = prev.length - 1 - idx;
              const updated = [...prev];
              updated[realIdx] = { ...updated[realIdx], done: true };
              return updated;
            });
          }
          break;

        case "finding":
          setLogs((prev) => [
            ...prev,
            {
              id: nextId.current++,
              text: event.summary || "",
              type: "finding",
            },
          ]);
          break;

        case "error":
          setLogs((prev) => [
            ...prev,
            {
              id: nextId.current++,
              text: event.message || "An error occurred",
              type: "error",
            },
          ]);
          // Surface fatal errors to dismiss the overlay
          // (non-fatal errors like "falling back to static" are followed by a complete event)
          break;

        case "complete":
          if (event.brief) {
            onComplete(event.brief);
          }
          break;
      }
    }

    runAnalysis();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progressPercent = total > 0 ? Math.min((progress / total) * 100, 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
      <div className="w-full max-w-lg px-6">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <IconLogo />
          <span className="text-lg font-semibold text-foreground tracking-tight">
            RepoRecall
          </span>
        </div>

        {/* Phase label */}
        <div className="text-center mb-3">
          {depth === "deep" && (
            <p className="text-[10px] uppercase tracking-wider text-accent font-medium mb-1">
              Deep Research {cycle && totalCycles ? `· Cycle ${cycle} of ${totalCycles}` : ""}
            </p>
          )}
          <p className="text-sm font-medium text-foreground">{phase}</p>
          <p className="text-xs text-foreground-secondary mt-1">
            {filesRead > 0 && `${filesRead} file${filesRead === 1 ? "" : "s"} explored`}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-border rounded-full overflow-hidden mb-6">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.max(progressPercent, 5)}%` }}
          />
        </div>

        {/* Log panel */}
        <div className="border border-border rounded-xl bg-surface/50 max-h-64 overflow-y-auto">
          <div className="p-3 space-y-1">
            {logs.length === 0 && (
              <p className="text-xs text-foreground-secondary/50 text-center py-4">
                Waiting for agent to begin exploration...
              </p>
            )}
            {logs.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 text-xs animate-fade-in"
              >
                <span className="mt-0.5 shrink-0">
                  {entry.type === "finding" ? (
                    <span className="text-accent">&#9733;</span>
                  ) : entry.type === "error" ? (
                    <span className="text-red-500">&#9888;</span>
                  ) : entry.done ? (
                    <span className="text-green-600">&#10003;</span>
                  ) : (
                    <span
                      className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin"
                    />
                  )}
                </span>
                <span
                  className={
                    entry.type === "finding"
                      ? "text-foreground font-medium"
                      : entry.type === "error"
                        ? "text-red-600"
                        : entry.done
                          ? "text-foreground-secondary"
                          : "text-foreground"
                  }
                >
                  {entry.text}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

function extractRepoName(url: string): string | null {
  const urlMatch = url.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/\s.]+)/
  );
  if (urlMatch) return `${urlMatch[1]}/${urlMatch[2].replace(/\.git$/, "")}`;
  const shortMatch = url.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch) return `${shortMatch[1]}/${shortMatch[2]}`;
  return null;
}

async function pollForBrief(
  repoName: string,
  maxAttempts = 6,
  intervalMs = 5000
): Promise<ProjectBrief | null> {
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const res = await fetch(
        `/api/briefs/by-repo?repo=${encodeURIComponent(repoName)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.found && data.brief) return data.brief;
      }
    } catch {
      // Network error — keep trying
    }
  }
  return null;
}

function formatAction(action: string, detail: string): string {
  switch (action) {
    case "readFile":
      return `Reading ${detail}`;
    case "readFileLines":
      return `Reading lines from ${detail}`;
    case "searchCode":
      return `Searching for ${detail}`;
    case "listDirectory":
      return `Listing ${detail || "root"}`;
    default:
      return `${action}: ${detail}`;
  }
}
