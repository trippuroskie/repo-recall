"use client";

import { useMemo, useState } from "react";
import type { CommitSummary } from "@/lib/types";

const WEEKS = 52;
const DAYS = 7;
const CELL_SIZE = 11;
const CELL_GAP = 2;
const LEFT_PADDING = 28;
const TOP_PADDING = 20;

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getIntensityClass(count: number): string {
  if (count === 0) return "fill-[var(--color-border)]";
  if (count <= 2) return "fill-emerald-300 dark:fill-emerald-800";
  if (count <= 5) return "fill-emerald-500 dark:fill-emerald-600";
  return "fill-emerald-700 dark:fill-emerald-400";
}

export function CommitHeatmap({ commits }: { commits: CommitSummary[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const { grid, monthLabels, maxCount } = useMemo(() => {
    // Build a map of date -> commit count
    const countMap = new Map<string, number>();
    for (const commit of commits) {
      const date = commit.date.slice(0, 10); // YYYY-MM-DD
      countMap.set(date, (countMap.get(date) || 0) + 1);
    }

    // Build 52-week grid ending today
    const today = new Date();
    const grid: { date: string; count: number; col: number; row: number }[] = [];
    const monthLabels: { label: string; col: number }[] = [];

    // Find the Sunday that starts the grid (52 weeks ago)
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (WEEKS * 7) - startDate.getDay());

    let lastMonth = -1;
    let maxCount = 0;

    for (let week = 0; week < WEEKS; week++) {
      for (let day = 0; day < DAYS; day++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + week * 7 + day);
        if (d > today) continue;

        const dateStr = d.toISOString().slice(0, 10);
        const count = countMap.get(dateStr) || 0;
        if (count > maxCount) maxCount = count;

        grid.push({ date: dateStr, count, col: week, row: day });

        // Track month boundaries for labels
        if (d.getMonth() !== lastMonth && day === 0) {
          lastMonth = d.getMonth();
          monthLabels.push({ label: MONTH_NAMES[lastMonth], col: week });
        }
      }
    }

    return { grid, monthLabels, maxCount };
  }, [commits]);

  if (commits.length < 10) return null;

  const svgWidth = LEFT_PADDING + WEEKS * (CELL_SIZE + CELL_GAP) + 4;
  const svgHeight = TOP_PADDING + DAYS * (CELL_SIZE + CELL_GAP) + 4;

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
        Commit Activity
      </h3>
      <div className="relative overflow-x-auto">
        <svg
          width={svgWidth}
          height={svgHeight}
          className="block"
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Month labels */}
          {monthLabels.map((m, i) => (
            <text
              key={i}
              x={LEFT_PADDING + m.col * (CELL_SIZE + CELL_GAP)}
              y={12}
              className="fill-[var(--color-foreground-secondary)] text-[10px]"
            >
              {m.label}
            </text>
          ))}

          {/* Day labels */}
          {DAY_LABELS.map((label, i) =>
            label ? (
              <text
                key={i}
                x={0}
                y={TOP_PADDING + i * (CELL_SIZE + CELL_GAP) + CELL_SIZE - 1}
                className="fill-[var(--color-foreground-secondary)] text-[10px]"
              >
                {label}
              </text>
            ) : null
          )}

          {/* Grid cells */}
          {grid.map((cell, i) => (
            <rect
              key={i}
              x={LEFT_PADDING + cell.col * (CELL_SIZE + CELL_GAP)}
              y={TOP_PADDING + cell.row * (CELL_SIZE + CELL_GAP)}
              width={CELL_SIZE}
              height={CELL_SIZE}
              rx={2}
              className={`${getIntensityClass(cell.count)} transition-opacity hover:opacity-80 cursor-default`}
              onMouseEnter={(e) => {
                const rect = (e.target as SVGRectElement).getBoundingClientRect();
                setTooltip({
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                  text: `${cell.count} commit${cell.count !== 1 ? "s" : ""} on ${cell.date}`,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="fixed z-50 px-2 py-1 text-xs bg-foreground text-background rounded shadow-lg pointer-events-none -translate-x-1/2 -translate-y-full -mt-2"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-2 text-xs text-foreground-secondary">
        <span>Less</span>
        <div className="w-[11px] h-[11px] rounded-sm bg-[var(--color-border)]" />
        <div className="w-[11px] h-[11px] rounded-sm bg-emerald-300 dark:bg-emerald-800" />
        <div className="w-[11px] h-[11px] rounded-sm bg-emerald-500 dark:bg-emerald-600" />
        <div className="w-[11px] h-[11px] rounded-sm bg-emerald-700 dark:bg-emerald-400" />
        <span>More</span>
        <span className="ml-2 text-foreground-secondary/60">
          {commits.length} commits · peak {maxCount}/day
        </span>
      </div>
    </div>
  );
}
