"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, X } from "lucide-react";

interface CodeViewerProps {
  owner: string;
  repo: string;
  files: string[];
  activeFile: string | null;
  activeLine: number | null;
  onFileSelect: (path: string) => void;
  onClose: () => void;
}

export function CodeViewer({
  owner,
  repo,
  files,
  activeFile,
  activeLine,
  onFileSelect,
  onClose,
}: CodeViewerProps) {
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lineRef = useRef<HTMLTableRowElement>(null);

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
      fetchFile(activeFile);
    }
  }, [activeFile, fetchFile]);

  // Scroll to active line
  useEffect(() => {
    if (activeLine && lineRef.current) {
      setTimeout(() => {
        lineRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [activeLine, activeFile]);

  const content = activeFile ? fileContents[activeFile] : null;
  const lines = content?.split("\n") || [];
  const fileName = (path: string) => path.split("/").pop() || path;

  // Infer language from file extension for styling
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
                const isActive = activeLine === lineNum;
                return (
                  <tr
                    key={i}
                    ref={isActive ? lineRef : undefined}
                    className={isActive ? "code-viewer-line-active" : ""}
                  >
                    <td className="code-viewer-line-num">{lineNum}</td>
                    <td className="code-viewer-line-code">
                      <pre>{line || "\n"}</pre>
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
