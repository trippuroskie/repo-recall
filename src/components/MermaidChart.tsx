"use client";

import { useEffect, useRef, useState } from "react";

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
      } catch {
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

  if (error) return null;

  return (
    <div
      ref={containerRef}
      className={`mermaid-container ${className}`}
      style={{
        backgroundColor: "rgba(55,53,47,0.02)",
        border: "1px solid rgba(55,53,47,0.06)",
        borderRadius: 8,
        padding: "20px 16px",
        overflow: "auto",
        marginBottom: 16,
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
