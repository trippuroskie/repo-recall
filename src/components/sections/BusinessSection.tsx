"use client";

import type { ProjectBrief } from "@/lib/types";
import { Tag } from "@/components/Tag";
import { MermaidChart } from "@/components/MermaidChart";
import { buildBusinessPieChart } from "@/lib/charts";
import { AlertTriangle, Users, DollarSign, Target } from "lucide-react";

export function BusinessSection({ brief }: { brief: ProjectBrief }) {
  const { businessContext } = brief;
  const pieChart = buildBusinessPieChart(brief);

  const categoryCounts = businessContext.featureClassification.reduce(
    (acc, f) => {
      acc[f.category] = (acc[f.category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground tracking-tight mb-1">
        Business Context
      </h2>
      <p className="text-foreground-secondary text-sm mb-6">
        Inferred business logic and product intent from code analysis.
      </p>

      {businessContext.isInferred && (
        <div className="flex items-start gap-2.5 bg-warning-light border border-orange-200 rounded-xl px-4 py-3 mb-6">
          <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
          <p className="text-sm text-warning">
            These insights are inferred from code structure, naming, and
            dependencies. They may not fully reflect actual business intent.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-foreground-secondary mb-2">
            <Users size={16} />
            <span className="text-xs font-medium uppercase tracking-wider">
              Target User
            </span>
          </div>
          <p className="text-sm text-foreground">
            {businessContext.targetUser}
          </p>
        </div>

        <div className="border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-foreground-secondary mb-2">
            <DollarSign size={16} />
            <span className="text-xs font-medium uppercase tracking-wider">
              Business Model
            </span>
          </div>
          <p className="text-sm text-foreground">
            {businessContext.businessModel}
          </p>
        </div>

        <div className="border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-foreground-secondary mb-2">
            <Target size={16} />
            <span className="text-xs font-medium uppercase tracking-wider">
              Value Prop
            </span>
          </div>
          <p className="text-sm text-foreground">
            {businessContext.valueProposition}
          </p>
        </div>
      </div>

      {/* Pie chart */}
      {pieChart && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
            Feature Distribution
          </h3>
          <MermaidChart chart={pieChart} />
        </div>
      )}

      {/* Feature classification breakdown */}
      <div>
        <h3 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
          Feature Classification
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(categoryCounts).map(([category, count]) => (
            <div
              key={category}
              className="flex items-center justify-between bg-surface rounded-xl px-4 py-3"
            >
              <Tag variant={category}>{category}</Tag>
              <span className="text-sm font-semibold text-foreground">
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
