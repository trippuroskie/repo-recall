"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronRight, FileCode, Layers, Box, Zap, Database, Globe } from "lucide-react";
import { CodeViewer } from "@/components/CodeViewer";
import type { ProjectBrief } from "@/lib/types";

interface CodemapSectionProps {
  brief: ProjectBrief;
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

export function CodemapSection({ brief }: CodemapSectionProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["1"]));
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
  }, []);

  const handleCloseViewer = useCallback(() => {
    setCodeViewerOpen(false);
  }, []);

  // Build the codemap sections from brief data
  const sections = buildCodemapSections(brief);

  // Collect all referenced files for the tab bar
  const allReferencedFiles = sections.flatMap((s) =>
    s.items.flatMap((item) => (item.codeRef ? [item.codeRef.path] : []))
  );
  const uniqueFiles = [...new Set([...viewerFiles, ...allReferencedFiles])];

  return (
    <div className="codemap-layout">
      {/* Left panel — structured architecture doc */}
      <div className={`codemap-doc ${codeViewerOpen ? "codemap-doc-split" : ""}`}>
        {/* Header */}
        <div className="codemap-header">
          <h1 className="codemap-title">{brief.repoInfo.name} Architecture</h1>
          <p className="codemap-subtitle">
            How {brief.repoInfo.name} is structured — from entry points to core modules.
            Click on code references to view source.
          </p>
        </div>

        {/* Sections */}
        {sections.map((section) => (
          <div key={section.id} className="codemap-section">
            {/* Section header */}
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

            {/* Section description */}
            <p className="codemap-section-desc">{section.description}</p>

            {/* Items */}
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

      {/* Right panel — Code viewer */}
      {codeViewerOpen && (
        <div className="codemap-code-panel">
          <CodeViewer
            owner={brief.repoInfo.owner}
            repo={brief.repoInfo.name}
            files={uniqueFiles.length > 0 ? uniqueFiles : []}
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
