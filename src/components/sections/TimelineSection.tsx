"use client";

import type { ProjectBrief } from "@/lib/types";
import { Tag } from "@/components/Tag";
import { MermaidChart } from "@/components/MermaidChart";
import { buildTimelineChart } from "@/lib/charts";
import { GitPullRequest, GitCommit } from "lucide-react";
import { format } from "date-fns";

interface TimelineEntry {
  date: string;
  dateLabel: string;
  title: string;
  description: string;
  prNumber?: number;
  theme: string;
}

// Flatten milestones into individual PR/commit entries
function flattenTimeline(brief: ProjectBrief): TimelineEntry[] {
  const { timeline } = brief;
  const entries: TimelineEntry[] = [];

  for (const milestone of timeline) {
    if (milestone.prs.length <= 1) {
      // Single PR or commit-based milestone — keep as-is
      let dateLabel: string;
      try {
        const [year, month] = milestone.date.split("-");
        dateLabel = format(
          new Date(parseInt(year), parseInt(month) - 1),
          "MMMM yyyy"
        );
      } catch {
        dateLabel = milestone.date;
      }
      entries.push({
        date: milestone.date,
        dateLabel,
        title: milestone.title,
        description: milestone.description,
        prNumber: milestone.prs[0],
        theme: milestone.theme,
      });
    } else {
      // Multiple PRs grouped — break them apart
      // Parse individual PR titles from the description ("N PR(s) merged: Title1, Title2")
      const prTitles = milestone.description
        .replace(/^\d+ PR\(s\) merged:\s*/, "")
        .split(", ");

      for (let j = 0; j < milestone.prs.length; j++) {
        let dateLabel: string;
        try {
          const [year, month] = milestone.date.split("-");
          dateLabel = format(
            new Date(parseInt(year), parseInt(month) - 1),
            "MMMM yyyy"
          );
        } catch {
          dateLabel = milestone.date;
        }
        entries.push({
          date: milestone.date,
          dateLabel,
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
  const { timeline } = brief;
  const ganttChart = buildTimelineChart(brief);

  if (timeline.length === 0) {
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

  const entries = flattenTimeline(brief);
  const hasPRs = entries.some((e) => e.prNumber);

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground tracking-tight mb-1">
        Timeline
      </h2>
      <p className="text-foreground-secondary text-sm mb-6">
        Evolution of the project based on{" "}
        {hasPRs ? "pull requests" : "commits"}.
      </p>

      {/* Gantt chart */}
      {ganttChart && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
            Project Evolution
          </h3>
          <MermaidChart chart={ganttChart} />
        </div>
      )}

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

        <div className="flex flex-col gap-4">
          {entries.map((entry, i) => {
            // Show date label only for the first entry of each month
            const showDate =
              i === 0 || entries[i - 1].date !== entry.date;

            return (
              <div key={i} className="relative flex gap-4 pl-0">
                {/* Dot */}
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
    </div>
  );
}
