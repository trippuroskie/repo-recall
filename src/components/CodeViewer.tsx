"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, X } from "lucide-react";
import { highlightLines } from "@/lib/highlighter";

interface CodeViewerProps {
  owner: string;
  repo: string;
  files: string[];
  activeFile: string | null;
  activeLine: number | null;
  activeLineEnd?: number | null;
  onFileSelect: (path: string) => void;
  onClose: () => void;
}

interface TokenSpan {
  content: string;
  color?: string;
}

export function CodeViewer({
  owner,
  repo,
  files,
  activeFile,
  activeLine,
  activeLineEnd,
  onFileSelect,
  onClose,
}: CodeViewerProps) {
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [highlightedTokens, setHighlightedTokens] = useState<
    Record<string, TokenSpan[][]>
  >({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lineRef = useRef<HTMLTableRowElement>(null);

  const getExtension = (path: string) =>
    path.split(".").pop()?.toLowerCase() || "";

  const fetchFile = useCallback(
    async (path: string) => {
      if (fileContents[path]) return;
      setLoading(path);
      setError(null);
      try {
        const res = await fetch(
          `/api/file?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`
        );
        if (!res.ok) throw new Error("Failed to load file");
        const data = await res.json();
        setFileContents((prev) => ({ ...prev, [path]: data.content }));

        // Trigger syntax highlighting
        const ext = getExtension(path);
        highlightLines(data.content, ext).then((result) => {
          setHighlightedTokens((prev) => ({
            ...prev,
            [path]: result.tokens,
          }));
        });
      } catch {
        setError(`Could not load ${path}`);
      } finally {
        setLoading(null);
      }
    },
    [owner, repo, fileContents]
  );

  useEffect(() => {
    if (activeFile) {
      setError(null);
      fetchFile(activeFile);
    }
  }, [activeFile, fetchFile]);

  // Scroll to active line (re-runs after content loads so lineRef is attached)
  const activeContent = activeFile ? fileContents[activeFile] : null;
  useEffect(() => {
    if (activeLine && lineRef.current) {
      setTimeout(() => {
        lineRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [activeLine, activeFile, activeContent]);

  const content = activeFile ? fileContents[activeFile] : null;
  const tokens = activeFile ? highlightedTokens[activeFile] : null;
  const lines = content?.split("\n") || [];
  const fileName = (path: string) => path.split("/").pop() || path;

  const isLineHighlighted = (lineNum: number) => {
    if (!activeLine) return false;
    const end = activeLineEnd ?? activeLine;
    return lineNum >= activeLine && lineNum <= end;
  };

  const getLanguageLabel = (path: string) => {
    const ext = path.split(".").pop()?.toLowerCase();
    const map: Record<string, string> = {
      ts: "TypeScript",
      tsx: "TSX",
      js: "JavaScript",
      jsx: "JSX",
      json: "JSON",
      md: "Markdown",
      css: "CSS",
      html: "HTML",
      py: "Python",
      rs: "Rust",
      go: "Go",
      yaml: "YAML",
      yml: "YAML",
      toml: "TOML",
      sql: "SQL",
      sh: "Shell",
      dockerfile: "Docker",
    };
    return map[ext || ""] || ext?.toUpperCase() || "";
  };

  const renderLineContent = (lineIndex: number, fallbackText: string) => {
    if (tokens && tokens[lineIndex]) {
      return (
        <pre style={{ margin: 0, font: "inherit" }}>
          {tokens[lineIndex].map((token, j) => (
            <span key={j} style={token.color ? { color: token.color } : undefined}>
              {token.content}
            </span>
          ))}
        </pre>
      );
    }
    return <pre style={{ margin: 0, font: "inherit" }}>{fallbackText || "\n"}</pre>;
  };

  return (
    <div className="code-viewer">
      {/* File tabs */}
      <div className="code-viewer-tabs">
        <div className="code-viewer-tabs-scroll">
          {files.map((path) => (
            <button
              key={path}
              onClick={() => onFileSelect(path)}
              className={`code-viewer-tab ${activeFile === path ? "code-viewer-tab-active" : ""}`}
            >
              <span className="code-viewer-tab-name">{fileName(path)}</span>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="code-viewer-close">
          <X size={14} />
        </button>
      </div>

      {/* File path breadcrumb */}
      {activeFile && (
        <div className="code-viewer-breadcrumb">
          {activeFile.split("/").map((part, i, arr) => (
            <span key={i}>
              <span style={{ color: i === arr.length - 1 ? "var(--foreground)" : undefined }}>
                {part}
              </span>
              {i < arr.length - 1 && (
                <span style={{ margin: "0 4px", opacity: 0.4 }}>&rsaquo;</span>
              )}
            </span>
          ))}
          {getLanguageLabel(activeFile) && (
            <span className="code-viewer-lang-badge">{getLanguageLabel(activeFile)}</span>
          )}
        </div>
      )}

      {/* Code content */}
      <div className="code-viewer-content">
        {loading && (
          <div className="code-viewer-loading">
            <Loader2 size={18} className="animate-spin" />
            <span>Loading {fileName(loading)}...</span>
          </div>
        )}

        {error && !loading && (
          <div className="code-viewer-error">{error}</div>
        )}

        {!loading && !error && content && (
          <table className="code-viewer-table">
            <tbody>
              {lines.map((line, i) => {
                const lineNum = i + 1;
                const highlighted = isLineHighlighted(lineNum);
                const isFirstHighlighted = highlighted && (lineNum === activeLine);
                return (
                  <tr
                    key={i}
                    ref={isFirstHighlighted ? lineRef : undefined}
                    className={highlighted ? "code-viewer-line-active" : ""}
                  >
                    <td className="code-viewer-line-num">{lineNum}</td>
                    <td className="code-viewer-line-code">
                      {renderLineContent(i, line)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!loading && !error && !content && !activeFile && (
          <div className="code-viewer-empty">
            Select a file reference to view code
          </div>
        )}
      </div>
    </div>
  );
}
