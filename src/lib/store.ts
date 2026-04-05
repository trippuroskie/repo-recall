import type { ProjectBrief } from "./types";

// Simple in-memory store for MVP (replace with DB later)
const briefs = new Map<string, ProjectBrief>();

export function saveBrief(brief: ProjectBrief): void {
  briefs.set(brief.id, brief);
}

export function getBrief(id: string): ProjectBrief | undefined {
  return briefs.get(id);
}

export function getAllBriefs(): ProjectBrief[] {
  return Array.from(briefs.values()).sort(
    (a, b) =>
      new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
  );
}

export function deleteBrief(id: string): boolean {
  return briefs.delete(id);
}
