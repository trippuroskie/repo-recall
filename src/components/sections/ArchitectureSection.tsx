"use client";

import type { ProjectBrief } from "@/lib/types";
import { Tag } from "@/components/Tag";
import { MermaidChart } from "@/components/MermaidChart";
import { buildArchitectureChart } from "@/lib/charts";
import { Box, Folder, Plug, Package } from "lucide-react";

export function ArchitectureSection({ brief }: { brief: ProjectBrief }) {
  const { architecture } = brief;
  const archChart = buildArchitectureChart(brief);

  const depCount = Object.keys(architecture.dependencies).length;
  const devDepsApprox = Object.entries(architecture.dependencies).filter(
    ([key]) => key.startsWith("@types/") || ["eslint", "typescript", "prettier", "jest", "vitest"].some((d) => key.includes(d))
  ).length;
  const prodDeps = depCount - devDepsApprox;

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground tracking-tight mb-1">
        Architecture
      </h2>
      <p className="text-foreground-secondary text-sm mb-6">
        {architecture.summary}
      </p>

      {/* Dependency stats */}
      {depCount > 0 && (
        <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-foreground-secondary border border-border rounded-xl px-5 py-3 bg-surface/50">
          <span className="flex items-center gap-1.5">
            <Package size={14} />
            {depCount} total dependencies
          </span>
          <span>~{prodDeps} production</span>
          <span>~{devDepsApprox} dev</span>
          <span>{architecture.apis.length} API endpoint(s)</span>
          <span>{architecture.integrations.length} integration(s)</span>
        </div>
      )}

      {/* Architecture diagram */}
      {archChart && (
        <div className="mb-8">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
            System Overview
          </h3>
          <MermaidChart chart={archChart} />
        </div>
      )}

      {/* Stack */}
      <div className="mb-8">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
          <Box size={14} />
          Tech Stack
        </h3>
        <div className="flex flex-wrap gap-2">
          {architecture.stack.map((tech) => (
            <span
              key={tech}
              className="px-3 py-1.5 bg-surface rounded-lg text-sm text-foreground font-medium"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>

      {/* Key Modules */}
      {architecture.keyModules.length > 0 && (
        <div className="mb-8">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
            <Folder size={14} />
            Key Modules
          </h3>
          <div className="border border-border rounded-xl overflow-hidden">
            {architecture.keyModules.map((mod, i) => (
              <div
                key={mod.name}
                className={`flex items-start gap-4 px-4 py-3 ${
                  i > 0 ? "border-t border-border" : ""
                } hover:bg-surface-hover transition-colors`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {mod.name}
                  </p>
                  <p className="text-xs text-foreground-secondary">
                    {mod.purpose}
                  </p>
                </div>
                <code className="text-xs text-foreground-secondary font-mono bg-surface px-2 py-0.5 rounded shrink-0">
                  {mod.path}
                </code>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* APIs */}
      {architecture.apis.length > 0 && (
        <div className="mb-8">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
            <Plug size={14} />
            API Endpoints
          </h3>
          <div className="flex flex-col gap-1.5">
            {architecture.apis.map((api) => (
              <code
                key={api}
                className="text-sm font-mono text-foreground bg-surface px-3 py-1.5 rounded-lg"
              >
                {api}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* Integrations */}
      {architecture.integrations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
            Integrations
          </h3>
          <div className="flex flex-wrap gap-2">
            {architecture.integrations.map((integration) => (
              <Tag key={integration} variant="medium">
                {integration}
              </Tag>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
