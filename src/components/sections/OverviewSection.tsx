"use client";

import type { ProjectBrief } from "@/lib/types";
import { MermaidChart } from "@/components/MermaidChart";
import { buildOverviewFlowChart } from "@/lib/charts";
import { Globe, Users, Zap, ArrowRight, Star, GitFork, FileCode, GitPullRequest, GitCommit, Calendar, Tag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function OverviewSection({ brief }: { brief: ProjectBrief }) {
  const { overview, repoInfo } = brief;
  const flowChart = buildOverviewFlowChart(brief);
  const stats = overview.stats;

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
          Created {repoInfo.createdAt ? formatDistanceToNow(new Date(repoInfo.createdAt), { addSuffix: true }) : "unknown"}
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
          label="Primary Language"
          value={`${repoInfo.language || "Multiple"}${stats?.topLanguages?.length > 1 ? ` (also ${stats.topLanguages.slice(1, 4).join(", ")})` : ""}`}
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
