"use client";

import type { ProjectBrief } from "@/lib/types";
import { Tag } from "@/components/Tag";
import { MermaidChart } from "@/components/MermaidChart";
import {
  buildArchitectureChart,
  buildStackLayersChart,
  buildDependencyChart,
} from "@/lib/charts";
import { Box, Folder, Plug, Package } from "lucide-react";

export function ArchitectureSection({ brief }: { brief: ProjectBrief }) {
  const { architecture } = brief;
  const systemChart = buildArchitectureChart(brief);
  const stackChart = buildStackLayersChart(brief);
  const depChart = buildDependencyChart(brief);

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

      {/* Charts row */}
      {(systemChart || stackChart || depChart) && (
        <div className="mb-8 flex flex-col gap-4">
          {/* Stack layers chart */}
          {stackChart && (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
                Stack Layers
              </h3>
              <MermaidChart chart={stackChart} />
            </div>
          )}

          {/* System overview + dependency side by side when both exist */}
          <div className={`grid gap-4 ${systemChart && depChart ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
            {systemChart && (
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
                  Module Overview
                </h3>
                <MermaidChart chart={systemChart} />
              </div>
            )}
            {depChart && (
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
                  Integrations & APIs
                </h3>
                <MermaidChart chart={depChart} />
              </div>
            )}
          </div>
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
        <div className="mb-8">
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

      {/* Dependencies */}
      {Object.keys(architecture.dependencies).length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
            <Package size={14} />
            Dependencies
          </h3>
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_auto] px-4 py-2 bg-surface text-xs font-medium text-foreground-secondary uppercase tracking-wider">
              <span>Package</span>
              <span>Version</span>
            </div>
            {Object.entries(architecture.dependencies)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([pkg, version], i) => (
                <div
                  key={pkg}
                  className={`grid grid-cols-[1fr_auto] items-center px-4 py-2 ${
                    i > 0 ? "border-t border-border" : "border-t border-border"
                  } hover:bg-surface-hover transition-colors`}
                >
                  <code className="text-sm font-mono text-foreground">
                    {pkg}
                  </code>
                  <code className="text-xs font-mono text-foreground-secondary bg-surface px-2 py-0.5 rounded">
                    {version}
                  </code>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
