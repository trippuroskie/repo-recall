"use client";

import type { ProjectBrief } from "@/lib/types";
import { Tag } from "@/components/Tag";
import { MermaidChart } from "@/components/MermaidChart";
import { buildTimelineChart } from "@/lib/charts";
import { GitCommit } from "lucide-react";
import { format } from "date-fns";

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

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground tracking-tight mb-1">
        Timeline
      </h2>
      <p className="text-foreground-secondary text-sm mb-6">
        Evolution of the project based on{" "}
        {timeline[0].prs.length > 0 ? "pull requests" : "commits"}.
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

        <div className="flex flex-col gap-6">
          {timeline.map((milestone, i) => {
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

            return (
              <div key={i} className="relative flex gap-4 pl-0">
                {/* Dot */}
                <div className="relative z-10 mt-1.5 w-[31px] shrink-0 flex justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-foreground border-2 border-background" />
                </div>

                <div className="flex-1 min-w-0 pb-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-foreground-secondary">
                      {dateLabel}
                    </span>
                    {milestone.theme !== "general" && (
                      <Tag variant="medium">{milestone.theme}</Tag>
                    )}
                  </div>
                  <h4 className="text-sm font-medium text-foreground mb-1">
                    {milestone.title}
                  </h4>
                  <p className="text-xs text-foreground-secondary leading-relaxed">
                    {milestone.description}
                  </p>
                  {milestone.prs.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <GitCommit size={12} className="text-foreground-secondary" />
                      <span className="text-xs text-foreground-secondary">
                        {milestone.prs.length} PR(s): #{milestone.prs.join(", #")}
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
