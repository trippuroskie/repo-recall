"use client";

import { useState } from "react";
import type { PRSummary } from "@/lib/types";
import { Tag } from "@/components/Tag";
import { MarkdownBody } from "@/components/MarkdownBody";
import { ChevronDown, ChevronUp, GitPullRequest, Plus, Minus, FileText } from "lucide-react";
import { format } from "date-fns";

export function PRDetailCard({ pr }: { pr: PRSummary }) {
  const [expanded, setExpanded] = useState(false);

  const mergedDate = pr.mergedAt
    ? format(new Date(pr.mergedAt), "MMM d, yyyy")
    : pr.closedAt
      ? format(new Date(pr.closedAt), "MMM d, yyyy")
      : format(new Date(pr.createdAt), "MMM d, yyyy");

  const stateColor =
    pr.state === "closed" && pr.mergedAt
      ? "text-purple-600 dark:text-purple-400"
      : pr.state === "open"
        ? "text-green-600 dark:text-green-400"
        : "text-red-500 dark:text-red-400";

  return (
    <div className="border border-border rounded-lg overflow-hidden transition-colors hover:border-foreground/20">
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left cursor-pointer"
      >
        <GitPullRequest size={14} className={`mt-0.5 shrink-0 ${stateColor}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              {pr.title}
            </span>
            <span className="text-xs text-foreground-secondary">
              #{pr.number}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1 text-xs text-foreground-secondary">
            <span>{pr.author}</span>
            <span>{mergedDate}</span>
            <span className="flex items-center gap-0.5">
              <Plus size={10} className="text-emerald-500" />
              {pr.additions}
            </span>
            <span className="flex items-center gap-0.5">
              <Minus size={10} className="text-red-400" />
              {pr.deletions}
            </span>
            {pr.changedFiles > 0 && (
              <span className="flex items-center gap-0.5">
                <FileText size={10} />
                {pr.changedFiles} files
              </span>
            )}
          </div>

          {pr.labels.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {pr.labels.slice(0, 4).map((label) => (
                <Tag key={label} variant="medium">
                  {label}
                </Tag>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 mt-0.5">
          {expanded ? (
            <ChevronUp size={14} className="text-foreground-secondary" />
          ) : (
            <ChevronDown size={14} className="text-foreground-secondary" />
          )}
        </div>
      </button>

      {/* Expanded body */}
      {expanded && pr.body && (
        <div className="px-3 pb-3 pt-0 border-t border-border">
          <MarkdownBody
            text={pr.body.length > 800 ? pr.body.slice(0, 800) + "..." : pr.body}
            className="mt-2.5 text-xs text-foreground-secondary leading-relaxed break-words max-h-48 overflow-y-auto"
          />
        </div>
      )}
    </div>
  );
}
