"use client";

import type { ProjectBrief } from "@/lib/types";
import { MermaidChart } from "@/components/MermaidChart";
import { buildOverviewFlowChart } from "@/lib/charts";
import { Globe, Users, Zap, ArrowRight } from "lucide-react";

export function OverviewSection({ brief }: { brief: ProjectBrief }) {
  const { overview, repoInfo } = brief;
  const flowChart = buildOverviewFlowChart(brief);

  return (
    <div className="animate-fade-in">
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

      <div className="prose-like mb-8">
        <p className="text-foreground text-base leading-relaxed">
          {overview.summary}
        </p>
      </div>

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
          label="Language"
          value={repoInfo.language || "Multiple"}
        />
      </div>

      {overview.majorFlows.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
            Major Flows
          </h3>

          {flowChart && <MermaidChart chart={flowChart} />}

          <div className="flex flex-col gap-2">
            {overview.majorFlows.map((flow, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 text-sm text-foreground"
              >
                <ArrowRight
                  size={14}
                  className="text-foreground-secondary shrink-0"
                />
                {flow}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
