"use client";

import type { ProjectBrief } from "@/lib/types";
import { Tag } from "@/components/Tag";
import { MermaidChart } from "@/components/MermaidChart";
import { buildFeatureTreeChart } from "@/lib/charts";
import { Code2, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

export function FeaturesSection({ brief }: { brief: ProjectBrief }) {
  const { features } = brief;
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));
  const featureChart = buildFeatureTreeChart(brief);

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  if (features.length === 0) {
    return (
      <div className="animate-fade-in">
        <h2 className="text-2xl font-bold text-foreground tracking-tight mb-4">
          Features
        </h2>
        <p className="text-foreground-secondary text-sm">
          No distinct feature areas detected. The codebase may be small or structured differently.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground tracking-tight mb-1">
        Features
      </h2>
      <p className="text-foreground-secondary text-sm mb-6">
        {features.length} feature area(s) detected, classified by business purpose.
      </p>

      {/* Feature tree chart */}
      {featureChart && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
            Feature Map
          </h3>
          <MermaidChart chart={featureChart} />
        </div>
      )}

      <div className="flex flex-col gap-2">
        {features.map((feature, i) => {
          const isOpen = expanded.has(i);

          return (
            <div
              key={i}
              className="border border-border rounded-xl overflow-hidden hover:border-border-hover transition-colors"
            >
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover transition-colors"
              >
                {isOpen ? (
                  <ChevronDown size={16} className="text-foreground-secondary shrink-0" />
                ) : (
                  <ChevronRight size={16} className="text-foreground-secondary shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">
                    {feature.name}
                  </span>
                </div>
                <Tag variant={feature.category}>{feature.category}</Tag>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-0 border-t border-border">
                  <p className="text-sm text-foreground-secondary mt-3 mb-3">
                    {feature.businessPurpose}
                  </p>

                  {feature.files.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-foreground-secondary uppercase tracking-wider mb-2">
                        Key Files
                      </p>
                      <div className="flex flex-col gap-1">
                        {feature.files.slice(0, 5).map((file) => (
                          <div key={file} className="flex items-center gap-2">
                            <Code2 size={12} className="text-foreground-secondary shrink-0" />
                            <code className="text-xs font-mono text-foreground-secondary truncate">
                              {file}
                            </code>
                          </div>
                        ))}
                        {feature.files.length > 5 && (
                          <p className="text-xs text-foreground-secondary/60 ml-5">
                            +{feature.files.length - 5} more files
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
