"use client";

import { useState, useMemo } from "react";
import type { ProjectBrief, PRSummary, CommitSummary } from "@/lib/types";
import { Tag } from "@/components/Tag";
import { MermaidChart } from "@/components/MermaidChart";
import { CommitHeatmap } from "@/components/CommitHeatmap";
import { LinesChangedChart } from "@/components/LinesChangedChart";
import { PRDetailCard } from "@/components/PRDetailCard";
import { MarkdownBody } from "@/components/MarkdownBody";
import { buildTimelineChart } from "@/lib/charts";
import { GitPullRequest, GitCommit, Sparkles } from "lucide-react";
import { format } from "date-fns";

type ViewMode = "milestones" | "activity";

// Interleaved activity entry for the "Activity" view
interface ActivityEntry {
  type: "pr" | "commit";
  date: string;
  dateLabel: string;
  pr?: PRSummary;
  commit?: CommitSummary;
}

// Build interleaved activity list from raw data
function buildActivityEntries(
  prs: PRSummary[],
  commits: CommitSummary[]
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  for (const pr of prs) {
    const date = pr.mergedAt || pr.createdAt;
    entries.push({
      type: "pr",
      date,
      dateLabel: formatDateLabel(date),
      pr,
    });
  }

  for (const commit of commits) {
    entries.push({
      type: "commit",
      date: commit.date,
      dateLabel: formatDateLabel(commit.date),
      commit,
    });
  }

  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function formatDateLabel(dateStr: string): string {
  try {
    return format(new Date(dateStr), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

function formatMonthLabel(dateKey: string): string {
  try {
    const [year, month] = dateKey.split("-");
    return format(new Date(parseInt(year), parseInt(month) - 1), "MMMM yyyy");
  } catch {
    return dateKey;
  }
}

// Legacy flattened timeline for backward compat with old briefs
interface LegacyTimelineEntry {
  date: string;
  dateLabel: string;
  title: string;
  description: string;
  prNumber?: number;
  theme: string;
}

function flattenLegacyTimeline(brief: ProjectBrief): LegacyTimelineEntry[] {
  const entries: LegacyTimelineEntry[] = [];
  for (const milestone of brief.timeline) {
    if (milestone.prs.length <= 1) {
      entries.push({
        date: milestone.date,
        dateLabel: formatMonthLabel(milestone.date),
        title: milestone.title,
        description: milestone.description,
        prNumber: milestone.prs[0],
        theme: milestone.theme,
      });
    } else {
      const prTitles = milestone.description
        .replace(/^\d+ PR\(s\) merged:\s*/, "")
        .split(", ");
      for (let j = 0; j < milestone.prs.length; j++) {
        entries.push({
          date: milestone.date,
          dateLabel: formatMonthLabel(milestone.date),
          title: prTitles[j] || `PR #${milestone.prs[j]}`,
          description: "",
          prNumber: milestone.prs[j],
          theme: milestone.theme,
        });
      }
    }
  }
  return entries;
}

export function TimelineSection({ brief }: { brief: ProjectBrief }) {
  const { timeline, timelineData } = brief;
  const ganttChart = buildTimelineChart(brief);
  const [viewMode, setViewMode] = useState<ViewMode>("milestones");

  const hasEnrichedData = !!timelineData && (timelineData.prs.length > 0 || timelineData.commits.length > 0);

  // Build PR lookup for milestone view
  const prMap = useMemo(() => {
    if (!timelineData) return new Map<number, PRSummary>();
    const map = new Map<number, PRSummary>();
    for (const pr of timelineData.prs) {
      map.set(pr.number, pr);
    }
    return map;
  }, [timelineData]);

  // Activity entries for interleaved view
  const activityEntries = useMemo(() => {
    if (!timelineData) return [];
    return buildActivityEntries(timelineData.prs, timelineData.commits);
  }, [timelineData]);

  if (timeline.length === 0 && !hasEnrichedData) {
    return (
      <div className="animate-fade-in">
        <h2 className="text-2xl font-bold text-foreground tracking-tight mb-4">
          Timeline
        </h2>
        <p className="text-foreground-secondary text-sm">
          No PR or commit history available to build a timeline.
        </p>
      </div>
    );
  }

  const prCount = timelineData?.prs.length ?? brief.overview.stats.totalPRs;
  const commitCount = timelineData?.commits.length ?? brief.overview.stats.totalCommits;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-2xl font-bold text-foreground tracking-tight">
          Timeline
        </h2>

        {/* View toggle — only when enriched data is available */}
        {hasEnrichedData && (
          <div className="flex items-center bg-surface rounded-lg border border-border p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("milestones")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === "milestones"
                  ? "bg-foreground text-background"
                  : "text-foreground-secondary hover:text-foreground"
              }`}
            >
              Milestones
            </button>
            <button
              type="button"
              onClick={() => setViewMode("activity")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === "activity"
                  ? "bg-foreground text-background"
                  : "text-foreground-secondary hover:text-foreground"
              }`}
            >
              Activity
            </button>
          </div>
        )}
      </div>

      <p className="text-foreground-secondary text-sm mb-6">
        {prCount > 0 && commitCount > 0
          ? `Based on ${prCount} pull request${prCount !== 1 ? "s" : ""} and ${commitCount} commit${commitCount !== 1 ? "s" : ""}.`
          : prCount > 0
            ? `Based on ${prCount} pull request${prCount !== 1 ? "s" : ""}.`
            : `Based on ${commitCount} commit${commitCount !== 1 ? "s" : ""}.`}
      </p>

      {/* Visualizations — only when enriched data is available */}
      {timelineData && (
        <>
          <CommitHeatmap commits={timelineData.commits} />
          {timelineData.prs.length > 0 && (
            <LinesChangedChart prs={timelineData.prs} />
          )}
        </>
      )}

      {/* Gantt chart */}
      {ganttChart && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
            Project Evolution
          </h3>
          <MermaidChart chart={ganttChart} />
        </div>
      )}

      {/* Timeline content — milestones view with enriched data */}
      {hasEnrichedData && viewMode === "milestones" && (
        <MilestonesView
          milestones={timelineData!.milestones}
          prMap={prMap}
          commits={timelineData!.commits}
          summaries={timelineData!.milestoneSummaries}
        />
      )}

      {/* Timeline content — activity view */}
      {hasEnrichedData && viewMode === "activity" && (
        <ActivityView entries={activityEntries} />
      )}

      {/* Legacy timeline — when no enriched data */}
      {!hasEnrichedData && <LegacyTimeline brief={brief} />}
    </div>
  );
}

// ── Milestones View ──

function MilestonesView({
  milestones,
  prMap,
  commits,
  summaries,
}: {
  milestones: ProjectBrief["timeline"];
  prMap: Map<number, PRSummary>;
  commits: CommitSummary[];
  summaries?: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-6">
      {milestones.map((ms, i) => {
        const monthCommits = commits.filter((c) => c.date.startsWith(ms.date));
        const milestonePRs = ms.prs.map((n) => prMap.get(n)).filter(Boolean) as PRSummary[];
        const aiSummary = summaries?.[ms.date];

        return (
          <div key={i} className="border border-border rounded-lg p-4">
            {/* Milestone header */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-foreground">
                {formatMonthLabel(ms.date)}
              </span>
              {ms.theme !== "general" && (
                <Tag variant="medium">{ms.theme}</Tag>
              )}
            </div>

            <h4 className="text-sm font-medium text-foreground mb-1">
              {ms.title}
            </h4>

            {/* AI Summary */}
            {aiSummary && (
              <div className="flex items-start gap-2 mt-2 mb-3 px-3 py-2 rounded-md bg-surface border border-border">
                <Sparkles size={12} className="text-amber-500 mt-0.5 shrink-0" />
                <MarkdownBody
                  text={aiSummary}
                  className="text-xs text-foreground-secondary leading-relaxed"
                />
              </div>
            )}

            {/* PRs in this milestone */}
            {milestonePRs.length > 0 && (
              <div className="mt-3">
                <h5 className="text-xs font-medium text-foreground-secondary uppercase tracking-wider mb-2">
                  Pull Requests ({milestonePRs.length})
                </h5>
                <div className="flex flex-col gap-2">
                  {milestonePRs.map((pr) => (
                    <PRDetailCard key={pr.number} pr={pr} />
                  ))}
                </div>
              </div>
            )}

            {/* Commits in this milestone */}
            {monthCommits.length > 0 && (
              <div className="mt-3">
                <h5 className="text-xs font-medium text-foreground-secondary uppercase tracking-wider mb-2">
                  Commits ({monthCommits.length})
                </h5>
                <div className="flex flex-col gap-1">
                  {monthCommits.slice(0, 8).map((commit) => (
                    <div key={commit.sha} className="flex items-center gap-2 py-1">
                      <GitCommit size={12} className="text-foreground-secondary shrink-0" />
                      <span className="text-xs text-foreground truncate flex-1">
                        {commit.message.split("\n")[0]}
                      </span>
                      <span className="text-[10px] text-foreground-secondary shrink-0 font-mono">
                        {commit.sha.slice(0, 7)}
                      </span>
                    </div>
                  ))}
                  {monthCommits.length > 8 && (
                    <p className="text-xs text-foreground-secondary mt-1">
                      +{monthCommits.length - 8} more commits
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Activity View ──

function ActivityView({ entries }: { entries: ActivityEntry[] }) {
  // Group by date for showing date headers
  let lastDateLabel = "";

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

      <div className="flex flex-col gap-3">
        {entries.slice(0, 100).map((entry, i) => {
          const showDate = entry.dateLabel !== lastDateLabel;
          lastDateLabel = entry.dateLabel;

          if (entry.type === "pr" && entry.pr) {
            return (
              <div key={`pr-${entry.pr.number}`} className="relative flex gap-4 pl-0">
                <div className="relative z-10 mt-1.5 w-[31px] shrink-0 flex justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-purple-500 border-2 border-background" />
                </div>
                <div className="flex-1 min-w-0">
                  {showDate && (
                    <span className="text-xs font-medium text-foreground-secondary block mb-1">
                      {entry.dateLabel}
                    </span>
                  )}
                  <PRDetailCard pr={entry.pr} />
                </div>
              </div>
            );
          }

          if (entry.type === "commit" && entry.commit) {
            const commit = entry.commit;
            return (
              <div key={`commit-${commit.sha}`} className="relative flex gap-4 pl-0">
                <div className="relative z-10 mt-1.5 w-[31px] shrink-0 flex justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-foreground border-2 border-background" />
                </div>
                <div className="flex-1 min-w-0 pb-1">
                  {showDate && (
                    <span className="text-xs font-medium text-foreground-secondary block mb-1">
                      {entry.dateLabel}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <GitCommit size={12} className="text-foreground-secondary shrink-0" />
                    <span className="text-sm text-foreground truncate">
                      {commit.message.split("\n")[0]}
                    </span>
                    <span className="text-[10px] text-foreground-secondary shrink-0 font-mono">
                      {commit.sha.slice(0, 7)}
                    </span>
                  </div>
                  <span className="text-xs text-foreground-secondary mt-0.5 block">
                    {commit.author}
                  </span>
                </div>
              </div>
            );
          }

          return null;
        })}

        {entries.length > 100 && (
          <p className="text-xs text-foreground-secondary pl-[47px] mt-2">
            +{entries.length - 100} more entries
          </p>
        )}
      </div>
    </div>
  );
}

// ── Legacy Timeline (backward compat for old briefs without timelineData) ──

function LegacyTimeline({ brief }: { brief: ProjectBrief }) {
  const entries = flattenLegacyTimeline(brief);
  const hasPRs = entries.some((e) => e.prNumber);

  return (
    <div className="relative">
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
      <div className="flex flex-col gap-4">
        {entries.map((entry, i) => {
          const showDate = i === 0 || entries[i - 1].date !== entry.date;
          return (
            <div key={i} className="relative flex gap-4 pl-0">
              <div className="relative z-10 mt-1.5 w-[31px] shrink-0 flex justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-foreground border-2 border-background" />
              </div>
              <div className="flex-1 min-w-0 pb-1">
                {showDate && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-foreground-secondary">
                      {entry.dateLabel}
                    </span>
                    {entry.theme !== "general" && (
                      <Tag variant="medium">{entry.theme}</Tag>
                    )}
                  </div>
                )}
                <h4 className="text-sm font-medium text-foreground mb-0.5">
                  {entry.title}
                </h4>
                {entry.description && (
                  <p className="text-xs text-foreground-secondary leading-relaxed">
                    {entry.description}
                  </p>
                )}
                {entry.prNumber && (
                  <div className="flex items-center gap-1.5 mt-1">
                    {hasPRs ? (
                      <GitPullRequest size={12} className="text-foreground-secondary" />
                    ) : (
                      <GitCommit size={12} className="text-foreground-secondary" />
                    )}
                    <span className="text-xs text-foreground-secondary">
                      #{entry.prNumber}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
