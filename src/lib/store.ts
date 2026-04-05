import type { ProjectBrief, ChatMessage } from "./types";

// Simple in-memory store for MVP (replace with DB later)
const briefs = new Map<string, ProjectBrief>();
const chatHistory = new Map<string, ChatMessage[]>();

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
  chatHistory.delete(id);
  return briefs.delete(id);
}

export function getChatMessages(briefId: string): ChatMessage[] {
  return chatHistory.get(briefId) || [];
}

export function addChatMessage(briefId: string, message: ChatMessage): void {
  const messages = chatHistory.get(briefId) || [];
  messages.push(message);
  chatHistory.set(briefId, messages);
}

export function clearChatMessages(briefId: string): void {
  chatHistory.delete(briefId);
}
