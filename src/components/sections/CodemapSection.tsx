"use client";

import { useState, useCallback, Fragment } from "react";
import { ChevronDown, ChevronRight, FileCode, Layers, Box, Zap, Database, Globe } from "lucide-react";
import { CodeViewer } from "@/components/CodeViewer";
import type { ProjectBrief, CodemapNode, Citation } from "@/lib/types";

interface CodemapSectionProps {
  brief: ProjectBrief;
  onCodePanelToggle?: (open: boolean) => void;
}

interface CodeRef {
  path: string;
  line?: number;
  label: string;
}

interface MapSection {
  id: string;
  number: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  items: {
    id: string;
    number: string;
    title: string;
    subtitle: string;
    codeRef?: CodeRef;
    details: string[];
  }[];
}

// Check if AI codemap has meaningful content
function hasAICodemap(brief: ProjectBrief): boolean {
  return !!(
    brief.codemap &&
    brief.codemap.nodes &&
    brief.codemap.nodes.length > 0 &&
    brief.codemap.nodes.some((n) => n.title && (n.description || n.children.length > 0))
  );
}

// Parse inline [[file:path/to/file.ts:42]] references from description text
function parseDescription(
  text: string,
  onRef: (ref: CodeRef) => void
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\[\[file:([^\]]+)\]\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Parse file reference: "path/to/file.ts:42" or "path/to/file.ts"
    const raw = match[1];
    const colonIdx = raw.lastIndexOf(":");
    let filePath: string;
    let line: number | undefined;

    if (colonIdx > 0 && /^\d+$/.test(raw.slice(colonIdx + 1))) {
      filePath = raw.slice(0, colonIdx);
      line = parseInt(raw.slice(colonIdx + 1), 10);
    } else {
      filePath = raw;
    }

    const ref: CodeRef = { path: filePath, line, label: raw };
    parts.push(
      <button
        key={`ref-${match.index}`}
        onClick={() => onRef(ref)}
        className="codemap-code-ref"
        style={{ display: "inline", margin: "0 2px" }}
      >
        {filePath.split("/").pop()}
        {line != null ? `:${line}` : ""}
      </button>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

// Render a single AI codemap node and its children recursively
function AICodemapNode({
  node,
  depth,
  expandedNodes,
  onToggle,
  onCodeRef,
}: {
  node: CodemapNode;
  depth: number;
  expandedNodes: Set<string>;
  onToggle: (id: string) => void;
  onCodeRef: (ref: CodeRef) => void;
}) {
  const isExpanded = expandedNodes.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const isTopLevel = depth === 0;

  return (
    <div className={isTopLevel ? "codemap-section" : ""} style={!isTopLevel ? { marginLeft: 16, marginTop: 4 } : undefined}>
      {/* Node header */}
      <button
        onClick={() => onToggle(node.id)}
        className={isTopLevel ? "codemap-section-header" : "codemap-item-header"}
        style={!isTopLevel ? { cursor: "pointer", display: "flex", alignItems: "center", gap: 6, width: "100%", background: "none", border: "none", padding: "6px 0", textAlign: "left" } : undefined}
      >
        <div className={isTopLevel ? "codemap-section-header-left" : ""} style={!isTopLevel ? { display: "flex", alignItems: "center", gap: 6 } : undefined}>
          <span className={isTopLevel ? "codemap-section-number" : "codemap-item-number"}>{node.id}</span>
          <span className={isTopLevel ? "codemap-section-title" : "codemap-item-title"}>{node.title}</span>
        </div>
        {(hasChildren || node.description) && (
          isExpanded ? (
            <ChevronDown size={14} style={{ color: "var(--foreground-secondary)", flexShrink: 0 }} />
          ) : (
            <ChevronRight size={14} style={{ color: "var(--foreground-secondary)", flexShrink: 0 }} />
          )
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{ paddingLeft: isTopLevel ? 0 : 8 }}>
          {/* Description with inline file references */}
          {node.description && (
            <p className="codemap-section-desc" style={{ whiteSpace: "pre-wrap" }}>
              {parseDescription(node.description, onCodeRef).map((part, i) => (
                <Fragment key={i}>{part}</Fragment>
              ))}
            </p>
          )}

          {/* Citation chips */}
          {node.citations && node.citations.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, marginBottom: 8 }}>
              {node.citations.map((c) => (
                <button
                  key={c.id}
                  className="codemap-code-ref"
                  onClick={() => onCodeRef({ path: c.filePath, line: c.startLine, label: c.filePath })}
                  title={c.snippet || c.filePath}
                >
                  {c.id} {c.filePath.split("/").pop()}
                  {c.startLine != null ? `:${c.startLine}` : ""}
                </button>
              ))}
            </div>
          )}

          {/* Recurse into children */}
          {hasChildren && node.children.map((child) => (
            <AICodemapNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              onCodeRef={onCodeRef}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CodemapSection({ brief, onCodePanelToggle }: CodemapSectionProps) {
  // Determine if we have an AI-generated codemap
  const useAI = hasAICodemap(brief);

  // Expand first top-level node by default; for AI codemap expand all top-level
  const defaultExpanded = useAI
    ? new Set(brief.codemap!.nodes.map((n) => n.id))
    : new Set(["1"]);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(defaultExpanded);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [codeViewerOpen, setCodeViewerOpen] = useState(false);
  const [viewerFiles, setViewerFiles] = useState<string[]>([]);

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCodeRef = useCallback((ref: CodeRef) => {
    setViewerFiles((prev) => {
      if (prev.includes(ref.path)) return prev;
      return [...prev, ref.path];
    });
    setActiveFile(ref.path);
    setActiveLine(ref.line || null);
    setCodeViewerOpen(true);
    onCodePanelToggle?.(true);
  }, [onCodePanelToggle]);

  const handleCloseViewer = useCallback(() => {
    setCodeViewerOpen(false);
    onCodePanelToggle?.(false);
  }, [onCodePanelToggle]);

  // Collect all referenced files for the CodeViewer tab bar
  const allReferencedFiles = useAI
    ? collectCitationFiles(brief.codemap!.nodes)
    : buildCodemapSections(brief).flatMap((s) =>
        s.items.flatMap((item) => (item.codeRef ? [item.codeRef.path] : []))
      );
  const uniqueFiles = [...new Set([...viewerFiles, ...allReferencedFiles])];

  if (useAI) {
    // ── AI Codemap rendering ──
    const codemap = brief.codemap!;
    return (
      <div className={`codemap-layout ${codeViewerOpen ? "codemap-layout-split" : ""}`}>
        <div className={`codemap-doc ${codeViewerOpen ? "codemap-doc-split" : ""}`}>
          <div className="codemap-header">
            <h1 className="codemap-title">{codemap.title || `${brief.repoInfo.name} Architecture`}</h1>
            {codemap.summary && (
              <p className="codemap-subtitle">{codemap.summary}</p>
            )}
            <p className="codemap-subtitle" style={{ marginTop: 4, fontSize: 12, color: "var(--foreground-secondary)" }}>
              Click on code references to view source.
            </p>
          </div>

          {codemap.nodes.map((node) => (
            <AICodemapNode
              key={node.id}
              node={node}
              depth={0}
              expandedNodes={expandedSections}
              onToggle={toggleSection}
              onCodeRef={handleCodeRef}
            />
          ))}
        </div>

        {codeViewerOpen && (
          <div className="codemap-code-panel">
            <CodeViewer
              owner={brief.repoInfo.owner}
              repo={brief.repoInfo.name}
              files={uniqueFiles}
              activeFile={activeFile}
              activeLine={activeLine}
              onFileSelect={setActiveFile}
              onClose={handleCloseViewer}
            />
          </div>
        )}
      </div>
    );
  }

  // ── Static fallback rendering ──
  const sections = buildCodemapSections(brief);

  return (
    <div className={`codemap-layout ${codeViewerOpen ? "codemap-layout-split" : ""}`}>
      <div className={`codemap-doc ${codeViewerOpen ? "codemap-doc-split" : ""}`}>
        <div className="codemap-header">
          <h1 className="codemap-title">{brief.repoInfo.name} Architecture</h1>
          <p className="codemap-subtitle">
            How {brief.repoInfo.name} is structured — from entry points to core modules.
            Click on code references to view source.
          </p>
        </div>

        {sections.map((section) => (
          <div key={section.id} className="codemap-section">
            <button
              onClick={() => toggleSection(section.id)}
              className="codemap-section-header"
            >
              <div className="codemap-section-header-left">
                <span className="codemap-section-number">{section.number}</span>
                <span className="codemap-section-icon">{section.icon}</span>
                <span className="codemap-section-title">{section.title}</span>
              </div>
              {expandedSections.has(section.id) ? (
                <ChevronDown size={16} style={{ color: "var(--foreground-secondary)" }} />
              ) : (
                <ChevronRight size={16} style={{ color: "var(--foreground-secondary)" }} />
              )}
            </button>

            <p className="codemap-section-desc">{section.description}</p>

            {expandedSections.has(section.id) && (
              <div className="codemap-items">
                {section.items.map((item) => (
                  <div key={item.id} className="codemap-item">
                    <div className="codemap-item-header">
                      <span className="codemap-item-number">{item.number}</span>
                      <div className="codemap-item-info">
                        <div className="codemap-item-title-row">
                          <span className="codemap-item-title">{item.title}</span>
                          {item.codeRef && (
                            <button
                              onClick={() => handleCodeRef(item.codeRef!)}
                              className="codemap-code-ref"
                            >
                              {item.codeRef.label}
                            </button>
                          )}
                        </div>
                        <p className="codemap-item-subtitle">{item.subtitle}</p>
                      </div>
                    </div>
                    {item.details.length > 0 && (
                      <ul className="codemap-item-details">
                        {item.details.map((detail, i) => (
                          <li key={i}>{detail}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {codeViewerOpen && (
        <div className="codemap-code-panel">
          <CodeViewer
            owner={brief.repoInfo.owner}
            repo={brief.repoInfo.name}
            files={uniqueFiles}
            activeFile={activeFile}
            activeLine={activeLine}
            onFileSelect={setActiveFile}
            onClose={handleCloseViewer}
          />
        </div>
      )}
    </div>
  );
}

// Recursively collect all citation file paths from codemap nodes
function collectCitationFiles(nodes: CodemapNode[]): string[] {
  const files: string[] = [];
  for (const node of nodes) {
    if (node.citations) {
      for (const c of node.citations) {
        if (c.filePath) files.push(c.filePath);
      }
    }
    if (node.children) {
      files.push(...collectCitationFiles(node.children));
    }
  }
  return files;
}

function buildCodemapSections(brief: ProjectBrief): MapSection[] {
  const sections: MapSection[] = [];
  let sectionNum = 1;

  // 1. Entry Points & Project Structure
  const entryItems = brief.entrypoints.slice(0, 6).map((ep, i) => ({
    id: `entry-${i}`,
    number: `${sectionNum}${String.fromCharCode(97 + i)}`,
    title: ep.path.split("/").pop() || ep.path,
    subtitle: ep.reason,
    codeRef: { path: ep.path, label: ep.path },
    details: [`Priority: ${ep.priority}`, `Type: ${ep.type}`],
  }));

  if (entryItems.length > 0) {
    sections.push({
      id: String(sectionNum),
      number: String(sectionNum),
      title: "Entry Points & Project Structure",
      description: "Key files to start understanding the codebase. These are the recommended starting points based on the project architecture.",
      icon: <Zap size={16} />,
      items: entryItems,
    });
    sectionNum++;
  }

  // 2. Core Modules
  const moduleItems = brief.architecture.keyModules.slice(0, 8).map((mod, i) => ({
    id: `mod-${i}`,
    number: `${sectionNum}${String.fromCharCode(97 + i)}`,
    title: mod.name,
    subtitle: mod.purpose,
    codeRef: { path: mod.path, label: mod.path },
    details: [],
  }));

  if (moduleItems.length > 0) {
    sections.push({
      id: String(sectionNum),
      number: String(sectionNum),
      title: "Core Modules",
      description: brief.architecture.summary || "The key architectural modules that make up this project.",
      icon: <Box size={16} />,
      items: moduleItems,
    });
    sectionNum++;
  }

  // 3. API Layer
  if (brief.architecture.apis.length > 0) {
    const apiItems = brief.architecture.apis.slice(0, 8).map((api, i) => {
      // APIs may be route paths like "/api/chat" — resolve to actual file paths
      const filePath = resolveApiPath(api);
      return {
        id: `api-${i}`,
        number: `${sectionNum}${String.fromCharCode(97 + i)}`,
        title: api,
        subtitle: `API route handler`,
        codeRef: filePath ? { path: filePath, label: filePath } : undefined,
        details: [],
      };
    });

    sections.push({
      id: String(sectionNum),
      number: String(sectionNum),
      title: "API Layer",
      description: `${brief.architecture.apis.length} API endpoint(s) powering the application's backend functionality.`,
      icon: <Globe size={16} />,
      items: apiItems,
    });
    sectionNum++;
  }

  // 4. Features & Business Logic
  const featureItems = brief.features.slice(0, 8).map((feat, i) => {
    const mainFile = feat.files[0];
    return {
      id: `feat-${i}`,
      number: `${sectionNum}${String.fromCharCode(97 + i)}`,
      title: feat.name,
      subtitle: feat.description,
      codeRef: mainFile ? { path: mainFile, label: mainFile } : undefined,
      details: [
        `Category: ${feat.category}`,
        `Business purpose: ${feat.businessPurpose}`,
        ...(feat.files.length > 1 ? [`+${feat.files.length - 1} more file(s)`] : []),
      ],
    };
  });

  if (featureItems.length > 0) {
    sections.push({
      id: String(sectionNum),
      number: String(sectionNum),
      title: "Features & Business Logic",
      description: "Core features mapped to their implementation files and business purposes.",
      icon: <Layers size={16} />,
      items: featureItems,
    });
    sectionNum++;
  }

  // 5. Tech Stack & Dependencies
  const stack = brief.architecture.stack;
  const deps = Object.entries(brief.architecture.dependencies).slice(0, 10);
  const stackItems: MapSection["items"] = [];

  if (stack.length > 0) {
    stackItems.push({
      id: "stack-core",
      number: `${sectionNum}a`,
      title: "Core Stack",
      subtitle: stack.join(", "),
      details: [],
    });
  }

  if (deps.length > 0) {
    stackItems.push({
      id: "stack-deps",
      number: `${sectionNum}b`,
      title: "Key Dependencies",
      subtitle: `${deps.length} primary dependencies`,
      codeRef: { path: "package.json", label: "package.json" },
      details: deps.map(([name, version]) => `${name}: ${version}`),
    });
  }

  if (brief.architecture.integrations.length > 0) {
    stackItems.push({
      id: "stack-int",
      number: `${sectionNum}c`,
      title: "Integrations",
      subtitle: brief.architecture.integrations.join(", "),
      details: [],
    });
  }

  if (stackItems.length > 0) {
    sections.push({
      id: String(sectionNum),
      number: String(sectionNum),
      title: "Tech Stack & Dependencies",
      description: `Built with ${stack.slice(0, 3).join(", ")}${stack.length > 3 ? ` and ${stack.length - 3} more` : ""}.`,
      icon: <Database size={16} />,
      items: stackItems,
    });
    sectionNum++;
  }

  // 6. File Structure Overview
  const fileItems: MapSection["items"] = [];
  const stats = brief.overview.stats;

  fileItems.push({
    id: "files-overview",
    number: `${sectionNum}a`,
    title: "Repository Stats",
    subtitle: `${stats.totalFiles} files, ${stats.totalPRs} PRs, ${stats.totalCommits} commits`,
    codeRef: { path: "README.md", label: "README.md" },
    details: stats.topLanguages.length > 0
      ? [`Languages: ${stats.topLanguages.join(", ")}`]
      : [],
  });

  sections.push({
    id: String(sectionNum),
    number: String(sectionNum),
    title: "Repository Overview",
    description: brief.overview.summary,
    icon: <FileCode size={16} />,
    items: fileItems,
  });

  return sections;
}

// Resolve API route paths (e.g. "/api/chat") to actual file paths
function resolveApiPath(api: string): string | null {
  // Already looks like a real file path
  if (api.includes(".")) return api;
  // Route path like "/api/chat" → "src/app/api/chat/route.ts"
  const clean = api.replace(/^\//, "");
  return `src/app/${clean}/route.ts`;
}
