"use client";

import React from "react";

/**
 * Lightweight markdown renderer for PR descriptions and commit messages.
 * Handles: headers, bold, inline code, links, bullet/numbered lists, paragraphs.
 */
export function MarkdownBody({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {renderBlocks(text)}
    </div>
  );
}

function renderBlocks(text: string): React.ReactNode[] {
  // Split code blocks first
  const parts = text.split(/(```\w*\s*\n[\s\S]*?```)/g);
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const codeMatch = part.match(/^```(\w*)\s*\n([\s\S]*?)```$/);
    if (codeMatch) {
      elements.push(
        <pre
          key={i}
          className="my-2 p-3 rounded-md bg-surface border border-border overflow-x-auto text-xs font-mono leading-relaxed"
        >
          {codeMatch[2]}
        </pre>
      );
    } else {
      elements.push(...renderParagraphs(part, i));
    }
  }
  return elements;
}

function renderParagraphs(text: string, blockIndex: number): React.ReactNode[] {
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs.map((para, pi) => {
    const trimmed = para.trim();
    if (!trimmed) return null;

    const lines = trimmed.split("\n");

    // Check if all lines are list items
    const isAllList = lines.every(
      (l) => /^\s*[-*]\s/.test(l) || /^\s*\d+\.\s/.test(l) || l.trim() === ""
    );

    if (isAllList) {
      return (
        <div key={`${blockIndex}-${pi}`} className="my-1.5 pl-1">
          {lines.map((line, li) => renderListItem(line, `${blockIndex}-${pi}-${li}`))}
        </div>
      );
    }

    // Single header line
    if (lines.length === 1 && /^#{1,3}\s/.test(lines[0])) {
      return <div key={`${blockIndex}-${pi}`}>{renderLine(lines[0], `${blockIndex}-${pi}-0`)}</div>;
    }

    // Regular paragraph
    return (
      <p key={`${blockIndex}-${pi}`} className="my-1.5">
        {lines.map((line, li) => (
          <React.Fragment key={li}>
            {renderLine(line, `${blockIndex}-${pi}-${li}`)}
            {li < lines.length - 1 && <br />}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

function renderListItem(text: string, key: string): React.ReactNode {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
  if (numMatch) {
    return (
      <div key={key} className="flex gap-2 py-0.5">
        <span className="text-foreground-secondary font-medium min-w-[18px] text-right shrink-0">
          {numMatch[1]}.
        </span>
        <span className="flex-1">{renderInline(numMatch[2])}</span>
      </div>
    );
  }

  const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
  if (bulletMatch) {
    return (
      <div key={key} className="flex gap-2 py-0.5">
        <span className="text-foreground-secondary shrink-0 mt-[5px]">
          <svg width="5" height="5" viewBox="0 0 5 5"><circle cx="2.5" cy="2.5" r="2" fill="currentColor" /></svg>
        </span>
        <span className="flex-1">{renderInline(bulletMatch[1])}</span>
      </div>
    );
  }

  return <div key={key}>{renderInline(trimmed)}</div>;
}

function renderLine(text: string, key: string): React.ReactNode {
  // H3
  const h3 = text.match(/^###\s+(.+)$/);
  if (h3) return <span key={key} className="block text-xs font-semibold mt-3 mb-1">{renderInline(h3[1])}</span>;

  // H2
  const h2 = text.match(/^##\s+(.+)$/);
  if (h2) return <span key={key} className="block text-sm font-semibold mt-3 mb-1">{renderInline(h2[1])}</span>;

  // H1
  const h1 = text.match(/^#\s+(.+)$/);
  if (h1) return <span key={key} className="block text-sm font-bold mt-3 mb-1">{renderInline(h1[1])}</span>;

  return <span key={key}>{renderInline(text)}</span>;
}

function renderInline(text: string): React.ReactNode {
  // Split on: `code`, **bold**, [link](url), and bare URLs
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+)/g);

  return parts.map((part, i) => {
    // Inline code
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="bg-surface border border-border px-1 py-px rounded text-[0.88em] font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }

    // Markdown link [text](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={i}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline underline-offset-2 decoration-foreground/30 hover:decoration-foreground/60"
        >
          {linkMatch[1]}
        </a>
      );
    }

    // Bare URL
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline underline-offset-2 decoration-foreground/30 hover:decoration-foreground/60 break-all"
        >
          {part}
        </a>
      );
    }

    return part;
  });
}
