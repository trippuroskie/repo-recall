"use client";

import { useState, useEffect, useRef } from "react";

export interface TraceEvent {
  type: "trace";
  action: string;
  status: "started" | "done";
  detail: string;
  files?: string[];
  count?: number;
  timestamp: number;
}

interface ChatTraceGroupProps {
  traces: TraceEvent[];
  isStreaming: boolean;
  defaultExpanded?: boolean;
}

function buildSummary(traces: TraceEvent[]): string {
  const filesDone = traces.filter(
    (t) => t.action === "fetch_file" && t.status === "done"
  );
  const selectDone = traces.find(
    (t) => t.action === "select_files" && t.status === "done"
  );
  const contextDone = traces.find(
    (t) => t.action === "build_context" && t.status === "done"
  );

  const parts: string[] = [];
  if (selectDone) parts.push("Analyzed query");
  if (filesDone.length > 0) {
    parts.push(`Read ${filesDone.length} file${filesDone.length === 1 ? "" : "s"}`);
  }
  if (contextDone && parts.length > 0) parts.push("built context");

  if (parts.length === 0) {
    // Still in progress
    const latest = traces[traces.length - 1];
    return latest?.detail || "Working...";
  }

  return parts.join(", ");
}

function isStepInProgress(trace: TraceEvent, allTraces: TraceEvent[], isStreaming: boolean): boolean {
  if (trace.status === "done") return false;
  // "thinking" stays in-progress as long as we're still streaming
  if (trace.action === "thinking") return isStreaming;
  // For any started event, treat it as resolved once a matching done event
  // with the same action has arrived.
  return !allTraces.some(
    (t) => t.action === trace.action && t.status === "done"
  );
}

export function ChatTraceGroup({
  traces,
  isStreaming,
  defaultExpanded,
}: ChatTraceGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const wasStreaming = useRef(isStreaming);

  // Auto-expand while streaming, auto-collapse when content starts
  useEffect(() => {
    if (isStreaming && !wasStreaming.current) {
      setExpanded(true);
    }
    if (!isStreaming && wasStreaming.current) {
      setExpanded(false);
    }
    wasStreaming.current = isStreaming;
  }, [isStreaming]);

  if (traces.length === 0) return null;

  const summary = buildSummary(traces);

  // Filter to meaningful display entries
  const displayEntries = traces.filter((t) => {
    if (t.action === "fetch_files" && t.status === "started") return true;
    if (t.action === "fetch_files" && t.status === "done") return false; // redundant with summary
    if (t.action === "build_context") return false; // shown in summary
    if (t.action === "thinking") return true;
    return true;
  });

  return (
    <div className="chat-trace-group">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="chat-trace-summary"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            flexShrink: 0,
          }}
        >
          <path
            d="M6 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {isStreaming && (
          <span
            className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin"
            style={{ flexShrink: 0 }}
          />
        )}
        <span>{summary}</span>
      </button>

      {expanded && (
        <div className="chat-trace-details">
          {displayEntries.map((trace, i) => (
            <div key={i} className="chat-trace-entry animate-fade-in">
              <span style={{ flexShrink: 0, width: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isStepInProgress(trace, traces, isStreaming) ? (
                  <span
                    className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin"
                  />
                ) : (
                  <span style={{ color: "var(--success, #0f766e)", fontSize: 12 }}>&#10003;</span>
                )}
              </span>
              <span>
                {trace.action === "fetch_file"
                  ? `Read ${trace.detail}`
                  : trace.detail}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
