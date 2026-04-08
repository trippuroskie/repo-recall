"use client";

import { useState, useCallback, Fragment } from "react";
import type { ProjectBrief } from "@/lib/types";
import { MermaidChart } from "@/components/MermaidChart";
import { CodeViewer } from "@/components/CodeViewer";
import { buildOverviewFlowChart } from "@/lib/charts";
import { buildFallbackExplanation } from "@/lib/charts";
import {
  Globe,
  Users,
  Zap,
  Star,
  GitFork,
  FileCode,
  GitPullRequest,
  GitCommit,
  Calendar,
  Tag,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface CodeRef {
  filePath: string;
  line?: number;
  label: string;
}

export function OverviewSection({ brief, onCodePanelToggle }: { brief: ProjectBrief; onCodePanelToggle?: (open: boolean) => void }) {
  const { overview, repoInfo } = brief;
  const flowChart = brief.diagrams?.overview || buildOverviewFlowChart(brief);
  const explanation =
    brief.overviewExplanation || buildFallbackExplanation(brief);
  const stats = overview.stats;

  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(
    () => new Set(explanation ? explanation.steps.map((_, i) => i) : [])
  );
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [codeViewerOpen, setCodeViewerOpen] = useState(false);
  const [viewerFiles, setViewerFiles] = useState<string[]>([]);

  const toggleStep = useCallback((idx: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const handleCodeRef = useCallback((ref: CodeRef) => {
    setViewerFiles((prev) => {
      if (prev.includes(ref.filePath)) return prev;
      return [...prev, ref.filePath];
    });
    setActiveFile(ref.filePath);
    setActiveLine(ref.line || null);
    setCodeViewerOpen(true);
    onCodePanelToggle?.(true);
  }, [onCodePanelToggle]);

  const handleCloseViewer = useCallback(() => {
    setCodeViewerOpen(false);
    onCodePanelToggle?.(false);
  }, [onCodePanelToggle]);

  // Collect all referenced files for the CodeViewer
  const allRefFiles = explanation
    ? explanation.steps.flatMap((s) => s.codeRefs.map((r) => r.filePath))
    : [];
  const uniqueFiles = [...new Set([...viewerFiles, ...allRefFiles])];

  return (
    <div className={`overview-layout ${codeViewerOpen ? "overview-layout-split" : ""}`}>
      <div className={`overview-doc ${codeViewerOpen ? "overview-doc-split" : ""}`}>
        <div className="animate-fade-in">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">
              {repoInfo.name}
            </h1>
            <p className="text-foreground-secondary text-base">
              {repoInfo.fullName}
              {repoInfo.isPrivate && (
                <span className="ml-2 text-xs bg-tag-yellow text-yellow-900 px-1.5 py-0.5 rounded">
                  Private
                </span>
              )}
            </p>
          </div>

          {/* Quick stats bar */}
          <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-foreground-secondary border border-border rounded-xl px-5 py-3 bg-surface/50">
            <span className="flex items-center gap-1.5">
              <Star size={14} />
              {repoInfo.stars.toLocaleString()} stars
            </span>
            <span className="flex items-center gap-1.5">
              <GitFork size={14} />
              {repoInfo.forks.toLocaleString()} forks
            </span>
            <span className="flex items-center gap-1.5">
              <FileCode size={14} />
              {stats?.totalFiles?.toLocaleString() ?? "—"} files
            </span>
            <span className="flex items-center gap-1.5">
              <GitPullRequest size={14} />
              {stats?.totalPRs ?? "—"} PRs
            </span>
            <span className="flex items-center gap-1.5">
              <GitCommit size={14} />
              {stats?.totalCommits ?? "—"} commits
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar size={14} />
              Created{" "}
              {repoInfo.createdAt
                ? formatDistanceToNow(new Date(repoInfo.createdAt), {
                    addSuffix: true,
                  })
                : "unknown"}
            </span>
          </div>

          {/* Topics */}
          {repoInfo.topics && repoInfo.topics.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-6">
              <Tag size={14} className="text-foreground-secondary mr-1" />
              {repoInfo.topics.map((topic) => (
                <span
                  key={topic}
                  className="px-2 py-0.5 bg-accent-light text-accent text-xs rounded-md font-medium"
                >
                  {topic}
                </span>
              ))}
            </div>
          )}

          {/* Summary */}
          <div className="prose-like mb-8">
            <p className="text-foreground text-base leading-relaxed">
              {overview.summary}
            </p>
          </div>

          {/* Info cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <InfoCard
              icon={<Users size={18} />}
              label="Likely User"
              value={overview.likelyUser}
            />
            <InfoCard
              icon={<Zap size={18} />}
              label="Value Proposition"
              value={overview.valueProposition}
            />
            <InfoCard
              icon={<Globe size={18} />}
              label="Primary Language"
              value={`${repoInfo.language || "Multiple"}${stats?.topLanguages?.length > 1 ? ` (also ${stats.topLanguages.slice(1, 4).join(", ")})` : ""}`}
            />
          </div>

          {/* How It Works — Diagram + Explanation */}
          {(flowChart || explanation) && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-foreground mb-1">
                How It Works
              </h2>
              {explanation && (
                <p className="text-sm text-foreground-secondary mb-4 leading-relaxed">
                  {explanation.introduction}
                </p>
              )}

              {/* Sequence diagram */}
              {flowChart && <MermaidChart chart={flowChart} />}

              {/* Flow explanation steps */}
              {explanation && explanation.steps.length > 0 && (
                <div className="overview-explanation">
                  <h3 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
                    Explanation of the Flow
                  </h3>
                  {explanation.steps.map((step, i) => (
                    <div key={i} className="overview-step">
                      <button
                        onClick={() => toggleStep(i)}
                        className="overview-step-header"
                      >
                        <div className="overview-step-header-left">
                          <span className="overview-step-number">{i + 1}</span>
                          <span className="overview-step-title">
                            {step.title}
                          </span>
                        </div>
                        {expandedSteps.has(i) ? (
                          <ChevronDown
                            size={14}
                            style={{ color: "var(--foreground-secondary)" }}
                          />
                        ) : (
                          <ChevronRight
                            size={14}
                            style={{ color: "var(--foreground-secondary)" }}
                          />
                        )}
                      </button>

                      {expandedSteps.has(i) && (
                        <div className="overview-step-body">
                          <p className="overview-step-description">
                            {renderDescription(step.description, handleCodeRef)}
                          </p>

                          {step.codeRefs.length > 0 && (
                            <div className="overview-step-refs">
                              {step.codeRefs.map((ref, j) => (
                                <button
                                  key={j}
                                  className="codemap-code-ref"
                                  onClick={() => handleCodeRef(ref)}
                                  title={`${ref.filePath}${ref.line ? `:${ref.line}` : ""}`}
                                >
                                  {ref.label ||
                                    ref.filePath.split("/").pop() ||
                                    ref.filePath}
                                  {ref.line != null ? `:${ref.line}` : ""}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Major flows */}
          {overview.majorFlows && overview.majorFlows.length > 0 && (
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
                Key User Flows
              </h3>
              <div className="space-y-2">
                {overview.majorFlows.map((flow, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 text-sm text-foreground leading-relaxed"
                  >
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent-light text-accent text-xs flex items-center justify-center font-medium mt-0.5">
                      {i + 1}
                    </span>
                    {flow}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {codeViewerOpen && (
        <div className="overview-code-panel">
          <CodeViewer
            owner={repoInfo.owner}
            repo={repoInfo.name}
            files={uniqueFiles}
            activeFile={activeFile}
            activeLine={activeLine}
            onFileSelect={setActiveFile}
            onClose={handleCloseViewer}
          />
        </div>
      )}
    </div>
  );
}

// Parse inline file:line references from description text and make them clickable
function renderDescription(
  text: string,
  onRef: (ref: CodeRef) => void
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match patterns like "filePath.ts:123" or "src/path/file.ts:42-58"
  const regex =
    /(?:^|\s)((?:[\w@.-]+\/)*[\w.-]+\.[a-z]{1,4}):(\d+)(?:-(\d+))?/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const matchStart =
      match.index + (match[0].length - match[0].trimStart().length);
    if (matchStart > lastIndex) {
      parts.push(text.slice(lastIndex, matchStart));
    }

    const filePath = match[1];
    const line = parseInt(match[2], 10);
    const fileName = filePath.split("/").pop() || filePath;

    parts.push(
      <button
        key={`ref-${match.index}`}
        onClick={() => onRef({ filePath, line, label: fileName })}
        className="codemap-code-ref"
        style={{ display: "inline", margin: "0 2px" }}
      >
        {fileName}:{match[2]}
        {match[3] ? `-${match[3]}` : ""}
      </button>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-border rounded-xl p-4 hover:border-border-hover transition-colors">
      <div className="flex items-center gap-2 text-foreground-secondary mb-2">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-sm text-foreground leading-snug">{value}</p>
    </div>
  );
}
