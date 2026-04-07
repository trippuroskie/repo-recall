"use client";

import { useMemo } from "react";
import type { PRSummary } from "@/lib/types";

const CHART_WIDTH = 700;
const CHART_HEIGHT = 180;
const PADDING = { top: 20, right: 16, bottom: 32, left: 56 };
const INNER_W = CHART_WIDTH - PADDING.left - PADDING.right;
const INNER_H = CHART_HEIGHT - PADDING.top - PADDING.bottom;

interface MonthData {
  label: string;
  additions: number;
  deletions: number;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function LinesChangedChart({ prs }: { prs: PRSummary[] }) {
  const months = useMemo(() => {
    const monthMap = new Map<string, { additions: number; deletions: number }>();

    for (const pr of prs) {
      if (!pr.mergedAt) continue;
      const date = new Date(pr.mergedAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const existing = monthMap.get(key) || { additions: 0, deletions: 0 };
      existing.additions += pr.additions;
      existing.deletions += pr.deletions;
      monthMap.set(key, existing);
    }

    const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]): MonthData => {
        const [, m] = key.split("-");
        return {
          label: MONTH_SHORT[parseInt(m) - 1],
          additions: data.additions,
          deletions: data.deletions,
        };
      });
  }, [prs]);

  if (months.length < 2) return null;

  const maxVal = Math.max(...months.map((m) => Math.max(m.additions, m.deletions)), 1);
  const barWidth = Math.min(24, (INNER_W / months.length - 4) / 2);
  const groupWidth = INNER_W / months.length;

  // Y-axis ticks
  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  const totalAdditions = months.reduce((s, m) => s + m.additions, 0);
  const totalDeletions = months.reduce((s, m) => s + m.deletions, 0);

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
        Lines Changed
      </h3>
      <div className="overflow-x-auto">
        <svg width={CHART_WIDTH} height={CHART_HEIGHT} className="block">
          {/* Grid lines */}
          {yTicks.map((tick, i) => {
            const y = PADDING.top + INNER_H - (tick / maxVal) * INNER_H;
            return (
              <g key={i}>
                <line
                  x1={PADDING.left}
                  y1={y}
                  x2={CHART_WIDTH - PADDING.right}
                  y2={y}
                  className="stroke-[var(--color-border)]"
                  strokeDasharray={i > 0 ? "3,3" : undefined}
                />
                <text
                  x={PADDING.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-[var(--color-foreground-secondary)] text-[10px]"
                >
                  {formatCount(tick)}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {months.map((month, i) => {
            const cx = PADDING.left + groupWidth * i + groupWidth / 2;
            const addH = (month.additions / maxVal) * INNER_H;
            const delH = (month.deletions / maxVal) * INNER_H;
            const baseY = PADDING.top + INNER_H;

            return (
              <g key={i}>
                {/* Additions bar */}
                <rect
                  x={cx - barWidth - 1}
                  y={baseY - addH}
                  width={barWidth}
                  height={addH}
                  rx={2}
                  className="fill-emerald-500/80 dark:fill-emerald-500/60"
                />
                {/* Deletions bar */}
                <rect
                  x={cx + 1}
                  y={baseY - delH}
                  width={barWidth}
                  height={delH}
                  rx={2}
                  className="fill-red-400/80 dark:fill-red-400/60"
                />
                {/* Month label */}
                <text
                  x={cx}
                  y={baseY + 16}
                  textAnchor="middle"
                  className="fill-[var(--color-foreground-secondary)] text-[10px]"
                >
                  {month.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-xs text-foreground-secondary">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/80 dark:bg-emerald-500/60" />
          +{formatCount(totalAdditions)} added
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-400/80 dark:bg-red-400/60" />
          -{formatCount(totalDeletions)} removed
        </span>
      </div>
    </div>
  );
}
