"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

interface ChartLightboxProps {
  svg: string;
  onClose: () => void;
}

export function ChartLightbox({ svg, onClose }: ChartLightboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [baseScale, setBaseScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Compute initial scale to fit SVG to viewport
  useEffect(() => {
    if (!mounted || !svgRef.current || !containerRef.current) return;
    const svgEl = svgRef.current.querySelector("svg");
    if (!svgEl) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const svgW = svgEl.getBoundingClientRect().width;
    const svgH = svgEl.getBoundingClientRect().height;
    if (svgW === 0 || svgH === 0) return;
    // Available space with padding
    const availW = containerRect.width - 96;
    const availH = containerRect.height - 96;
    const fitScale = Math.min(availW / svgW, availH / svgH);
    // Only scale up if diagram is smaller than available space
    if (fitScale > 1) {
      setBaseScale(fitScale);
      setScale(fitScale);
    }
  }, [mounted, svg]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Zoom with scroll wheel — must use native listener with { passive: false }
  // to allow preventDefault (React attaches wheel listeners as passive)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      setScale((s) => Math.min(5, Math.max(0.2, s - e.deltaY * 0.001)));
    }
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Drag handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      posStart.current = { ...position };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [position]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      setPosition({
        x: posStart.current.x + (e.clientX - dragStart.current.x),
        y: posStart.current.y + (e.clientY - dragStart.current.y),
      });
    },
    [dragging]
  );

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  // Reset view
  const handleReset = useCallback(() => {
    setScale(baseScale);
    setPosition({ x: 0, y: 0 });
  }, [baseScale]);

  if (!mounted) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        flexDirection: "column",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
          padding: "12px 16px",
        }}
      >
        <button
          onClick={() => setScale((s) => Math.min(5, s + 0.25))}
          style={toolbarBtnStyle}
          title="Zoom in"
        >
          +
        </button>
        <span
          style={{
            color: "rgba(255,255,255,0.7)",
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
            minWidth: 44,
            textAlign: "center",
          }}
        >
          {Math.round((scale / baseScale) * 100)}%
        </span>
        <button
          onClick={() => setScale((s) => Math.max(0.2, s - 0.25))}
          style={toolbarBtnStyle}
          title="Zoom out"
        >
          &minus;
        </button>
        <button onClick={handleReset} style={toolbarBtnStyle} title="Reset view">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 8a6 6 0 1011.47-2.47"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M8 2V5h3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div style={{ width: 1, height: 20, backgroundColor: "rgba(255,255,255,0.15)", margin: "0 4px" }} />
        <button onClick={onClose} style={toolbarBtnStyle} title="Close (Esc)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Chart area */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          flex: 1,
          overflow: "hidden",
          cursor: dragging ? "grabbing" : "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          ref={svgRef}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: "center center",
            transition: dragging ? "none" : "transform 0.1s ease-out",
            backgroundColor: "#ffffff",
            borderRadius: 12,
            padding: "32px 24px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>,
    document.body
  );
}

const toolbarBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.1)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  color: "rgba(255,255,255,0.85)",
  fontSize: 16,
  fontWeight: 500,
  cursor: "pointer",
  lineHeight: 1,
};
