"use client";

import { useState, useEffect } from "react";
import { highlightCode, resolveLanguage } from "@/lib/highlighter";

interface HighlightedCodeProps {
  code: string;
  language: string;
}

export function HighlightedCode({ code, language }: HighlightedCodeProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    highlightCode(code, language).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => { cancelled = true; };
  }, [code, language]);

  const langLabel = resolveLanguage(language);

  if (html) {
    return (
      <div className="chat-code-block">
        {langLabel !== "text" && (
          <div className="chat-code-lang">{langLabel}</div>
        )}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    );
  }

  // Fallback while loading
  return (
    <pre className="chat-code-block-fallback">
      {langLabel !== "text" && (
        <div className="chat-code-lang">{langLabel}</div>
      )}
      <code>{code}</code>
    </pre>
  );
}
