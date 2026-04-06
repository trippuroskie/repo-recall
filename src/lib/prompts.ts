import type { ProjectBrief } from "./types";

export function buildBriefContext(brief: ProjectBrief): string {
  const sections: string[] = [];

  sections.push(`# Repository: ${brief.repoInfo.fullName}`);
  sections.push(`URL: ${brief.repoInfo.url}`);
  sections.push(`Language: ${brief.repoInfo.language || "Unknown"}`);
  sections.push(`Stars: ${brief.repoInfo.stars} | Forks: ${brief.repoInfo.forks}`);
  if (brief.repoInfo.description) {
    sections.push(`Description: ${brief.repoInfo.description}`);
  }

  sections.push(`\n## Overview`);
  sections.push(brief.overview.summary);
  sections.push(`Likely user: ${brief.overview.likelyUser}`);
  sections.push(`Value proposition: ${brief.overview.valueProposition}`);
  if (brief.overview.majorFlows.length > 0) {
    sections.push(`Major flows:\n${brief.overview.majorFlows.map((f) => `- ${f}`).join("\n")}`);
  }

  sections.push(`\n## Architecture`);
  sections.push(brief.architecture.summary);
  sections.push(`Stack: ${brief.architecture.stack.join(", ")}`);
  if (brief.architecture.keyModules.length > 0) {
    sections.push(
      `Key modules:\n${brief.architecture.keyModules.map((m) => `- ${m.name} (${m.path}): ${m.purpose}`).join("\n")}`
    );
  }
  if (brief.architecture.apis.length > 0) {
    sections.push(`APIs: ${brief.architecture.apis.join(", ")}`);
  }
  if (brief.architecture.integrations.length > 0) {
    sections.push(`Integrations: ${brief.architecture.integrations.join(", ")}`);
  }

  sections.push(`\n## Features`);
  for (const feature of brief.features) {
    sections.push(`- **${feature.name}** [${feature.category}]: ${feature.description}`);
    sections.push(`  Business purpose: ${feature.businessPurpose}`);
    if (feature.files.length > 0) {
      sections.push(`  Files: ${feature.files.slice(0, 5).join(", ")}`);
    }
  }

  sections.push(`\n## Business Context`);
  sections.push(`Target user: ${brief.businessContext.targetUser}`);
  sections.push(`Business model: ${brief.businessContext.businessModel}`);
  sections.push(`Value prop: ${brief.businessContext.valueProposition}`);

  sections.push(`\n## Timeline`);
  for (const milestone of brief.timeline.slice(0, 10)) {
    sections.push(`- ${milestone.date}: ${milestone.title} [${milestone.theme}]`);
    sections.push(`  ${milestone.description}`);
  }

  sections.push(`\n## Entrypoints`);
  for (const ep of brief.entrypoints) {
    sections.push(`- ${ep.path} [${ep.priority}]: ${ep.reason}`);
  }

  const deps = Object.entries(brief.architecture.dependencies);
  if (deps.length > 0) {
    sections.push(`\n## Dependencies`);
    sections.push(deps.map(([name, version]) => `- ${name}: ${version}`).join("\n"));
  }

  return sections.join("\n");
}

export const CHAT_SYSTEM_PROMPT = `You are RepoRecall, an expert code analyst assistant. You help developers understand codebases by answering questions about repositories that have been analyzed.

You have access to a comprehensive brief about the repository being discussed. Use this context to provide accurate, helpful answers.

Guidelines:
- Be concise but thorough. Prioritize clarity.
- When you reference specific files, use the special syntax [[file:path/to/file.ts]] to create clickable code references. This will open the file in a code viewer panel for the user. For example: "The main entry point is [[file:src/app/page.tsx]]" or "Authentication is handled in [[file:lib/auth.ts]]".
- When source files are provided below with line numbers, ALWAYS use line-specific references: [[file:path/to/file.ts:42]] for a single line or [[file:path/to/file.ts:42-58]] for a range. This will highlight the exact code in the viewer. For example: "The spawn function starts at [[file:src/codex.rs:436]]" or "The session initialization is at [[file:core/src/codex.rs:647-660]]". Use the line numbers from the provided source files — do not guess line numbers.
- Always reference at least 1-3 relevant files per answer using the [[file:...]] syntax when discussing code structure, architecture, or implementation details. STRONGLY prefer line-specific references when source files are provided.
- If the brief doesn't contain enough information to fully answer a question, say so honestly and suggest what the developer could look into.
- Use markdown formatting for readability (code blocks, bold, lists). Use fenced code blocks with language identifiers (e.g. \`\`\`typescript, \`\`\`python) for syntax highlighting.
- When discussing architecture or flows, explain the connections between components.
- If asked about something outside the brief's scope, acknowledge the limitation.`;
