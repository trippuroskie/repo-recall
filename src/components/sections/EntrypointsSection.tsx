"use client";

import type { ProjectBrief } from "@/lib/types";
import { Tag } from "@/components/Tag";
import { MermaidChart } from "@/components/MermaidChart";
import { buildEntrypointsChart } from "@/lib/charts";
import { FileCode, Server, Workflow, ArrowUpRight } from "lucide-react";

const typeIcons = {
  file: FileCode,
  service: Server,
  flow: Workflow,
};

export function EntrypointsSection({ brief }: { brief: ProjectBrief }) {
  const { entrypoints, repoInfo } = brief;
  const entryChart = buildEntrypointsChart(brief);

  if (entrypoints.length === 0) {
    return (
      <div className="animate-fade-in">
        <h2 className="text-2xl font-bold text-foreground tracking-tight mb-4">
          Where to Start
        </h2>
        <p className="text-foreground-secondary text-sm">
          No specific entrypoints identified.
        </p>
      </div>
    );
  }

  const grouped = {
    high: entrypoints.filter((e) => e.priority === "high"),
    medium: entrypoints.filter((e) => e.priority === "medium"),
    low: entrypoints.filter((e) => e.priority === "low"),
  };

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground tracking-tight mb-1">
        Where to Start
      </h2>
      <p className="text-foreground-secondary text-sm mb-6">
        Recommended files and flows to inspect first when resuming work.
      </p>

      {/* Navigation path chart */}
      {entryChart && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
            Suggested Navigation Path
          </h3>
          <MermaidChart chart={entryChart} />
        </div>
      )}

      {(["high", "medium", "low"] as const).map(
        (priority) =>
          grouped[priority].length > 0 && (
            <div key={priority} className="mb-6">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
                <Tag variant={priority}>{priority} priority</Tag>
              </h3>
              <div className="flex flex-col gap-2">
                {grouped[priority].map((entry, i) => {
                  const Icon = typeIcons[entry.type];

                  return (
                    <a
                      key={i}
                      href={`${repoInfo.url}/blob/${repoInfo.defaultBranch}/${entry.path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-3 border border-border rounded-xl px-4 py-3 hover:border-border-hover hover:bg-surface-hover transition-all"
                    >
                      <Icon
                        size={16}
                        className="text-foreground-secondary mt-0.5 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono text-foreground font-medium truncate">
                            {entry.path}
                          </code>
                          <ArrowUpRight
                            size={12}
                            className="text-foreground-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          />
                        </div>
                        <p className="text-xs text-foreground-secondary mt-0.5">
                          {entry.reason}
                        </p>
                      </div>
                      <Tag variant={entry.type}>{entry.type}</Tag>
                    </a>
                  );
                })}
              </div>
            </div>
          )
      )}
    </div>
  );
}
