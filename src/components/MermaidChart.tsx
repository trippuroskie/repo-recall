"use client";

import { useEffect, useRef, useState } from "react";
import { ChartLightbox } from "./ChartLightbox";

let mermaidInitialized = false;

export function MermaidChart({
  chart,
  className = "",
}: {
  chart: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;

        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: "base",
            themeVariables: {
              primaryColor: "#f7f6f3",
              primaryTextColor: "#37352f",
              primaryBorderColor: "#e5e5e5",
              lineColor: "#d1d5db",
              secondaryColor: "#e8f0fe",
              tertiaryColor: "#f0fdf4",
              fontFamily:
                "-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif",
              fontSize: "13px",
              nodeTextColor: "#37352f",
            },
            flowchart: {
              htmlLabels: true,
              curve: "basis",
              padding: 12,
            },
            pie: {
              textPosition: 0.75,
            },
          });
          mermaidInitialized = true;
        }

        const { svg: renderedSvg } = await mermaid.render(
          idRef.current,
          chart.trim()
        );

        if (!cancelled) {
          setSvg(renderedSvg);
          setError(false);
        }
      } catch (err) {
        console.warn("[MermaidChart] render failed:", err);
        if (!cancelled) {
          setError(true);
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <div
        className={`mermaid-container ${className}`}
        style={{
          backgroundColor: "rgba(55,53,47,0.02)",
          border: "1px solid rgba(55,53,47,0.06)",
          borderRadius: 8,
          padding: "16px",
          marginBottom: 16,
          overflow: "auto",
        }}
      >
        <pre
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.5,
            color: "rgb(100,99,97)",
            whiteSpace: "pre-wrap",
            fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
          }}
        >
          {chart}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div
        className={`mermaid-container ${className}`}
        style={{
          backgroundColor: "rgba(55,53,47,0.02)",
          border: "1px solid rgba(55,53,47,0.06)",
          borderRadius: 8,
          padding: "20px 16px",
          minHeight: 120,
          marginBottom: 16,
        }}
      />
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className={`mermaid-container ${className}`}
        onClick={() => setLightboxOpen(true)}
        style={{
          backgroundColor: "rgba(55,53,47,0.02)",
          border: "1px solid rgba(55,53,47,0.06)",
          borderRadius: 8,
          padding: "20px 16px",
          overflow: "auto",
          marginBottom: 16,
          cursor: "pointer",
          position: "relative",
        }}
      >
        <div dangerouslySetInnerHTML={{ __html: svg }} />
        {/* Expand hint */}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            backgroundColor: "rgba(55,53,47,0.04)",
            color: "rgb(160,159,156)",
            opacity: 0.6,
            transition: "opacity 0.15s",
          }}
          className="expand-hint"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 2h4v4M6 14H2v-4M14 2L9.5 6.5M2 14l4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      {lightboxOpen && (
        <ChartLightbox svg={svg} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  );
}
