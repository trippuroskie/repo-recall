import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { ProjectBrief, ChatMessage } from "./types";

async function getClient() {
  if (process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV === "development") {
    return createServiceClient();
  }
  return createClient();
}

type BriefInsert = Database["public"]["Tables"]["briefs"]["Insert"];
type SessionInsert = Database["public"]["Tables"]["chat_sessions"]["Insert"];
type ChatInsert = Database["public"]["Tables"]["chat_messages"]["Insert"];
type UsageInsert = Database["public"]["Tables"]["usage"]["Insert"];

export async function saveBrief(
  brief: ProjectBrief,
  userId: string
): Promise<void> {
  const supabase = await getClient();
  const row: BriefInsert = {
    id: brief.id,
    user_id: userId,
    repo_full_name: brief.repoInfo.fullName,
    repo_info: JSON.parse(JSON.stringify(brief.repoInfo)),
    overview: JSON.parse(JSON.stringify(brief.overview)),
    architecture: JSON.parse(JSON.stringify(brief.architecture)),
    features: JSON.parse(JSON.stringify(brief.features)),
    business_context: JSON.parse(JSON.stringify(brief.businessContext)),
    timeline: JSON.parse(JSON.stringify(brief.timeline)),
    entrypoints: JSON.parse(JSON.stringify(brief.entrypoints)),
    generated_at: brief.generatedAt,
    ...(brief.codemap ? { codemap: JSON.parse(JSON.stringify(brief.codemap)) } : {}),
    ...(brief.timelineData ? { timeline_data: JSON.parse(JSON.stringify(brief.timelineData)) } : {}),
  };
  const { error } = await supabase
    .from("briefs")
    .upsert(row, { onConflict: "user_id,repo_full_name" });
  if (error) throw new Error(`Failed to save brief: ${error.message}`);
}

export async function getBriefByRepo(
  userId: string,
  repoFullName: string
): Promise<ProjectBrief | null> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("briefs")
    .select("*")
    .eq("user_id", userId)
    .eq("repo_full_name", repoFullName)
    .single();

  if (error || !data) return null;
  return rowToBrief(data);
}

export async function getBrief(id: string): Promise<ProjectBrief | null> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("briefs")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return rowToBrief(data);
}

export async function getAllBriefs(): Promise<ProjectBrief[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("briefs")
    .select("*")
    .order("generated_at", { ascending: false });

  if (error || !data) return [];
  return data.map(rowToBrief);
}

export async function deleteBrief(id: string): Promise<boolean> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("briefs")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

// ─── Chat Sessions ───

export async function createChatSession(
  briefId: string,
  userId: string,
  title?: string
): Promise<string> {
  const supabase = await getClient();
  const id = crypto.randomUUID();
  const row: SessionInsert = {
    id,
    brief_id: briefId,
    user_id: userId,
    title: title || "New chat",
  };
  const { error } = await supabase.from("chat_sessions").insert(row);
  if (error) throw new Error(`Failed to create chat session: ${error.message}`);
  return id;
}

export async function getChatSessionsForBrief(
  briefId: string
): Promise<{ id: string; title: string; createdAt: string; updatedAt: string }[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("brief_id", briefId)
    .order("updated_at", { ascending: false });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getChatSessionsForUser(
  userId: string
): Promise<{ id: string; briefId: string; title: string; createdAt: string; updatedAt: string }[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    briefId: row.brief_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateChatSessionTitle(
  sessionId: string,
  title: string
): Promise<void> {
  const supabase = await getClient();
  await supabase.from("chat_sessions").update({ title }).eq("id", sessionId);
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  const supabase = await getClient();
  await supabase.from("chat_sessions").delete().eq("id", sessionId);
}

// ─── Chat Messages ───

export async function getChatMessages(
  briefId: string,
  sessionId?: string
): Promise<ChatMessage[]> {
  const supabase = await getClient();
  let query = supabase
    .from("chat_messages")
    .select("*")
    .eq("brief_id", briefId)
    .order("timestamp", { ascending: true });

  if (sessionId) {
    query = query.eq("session_id", sessionId);
  }

  const { data, error } = await query;

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    role: row.role as "user" | "assistant",
    content: row.content,
    timestamp: row.timestamp,
  }));
}

export async function addChatMessage(
  briefId: string,
  message: ChatMessage,
  userId: string,
  sessionId?: string
): Promise<void> {
  const supabase = await getClient();
  const row: ChatInsert = {
    id: message.id,
    brief_id: briefId,
    session_id: sessionId || briefId + "_default",
    user_id: userId,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
  };
  const { error } = await supabase.from("chat_messages").insert(row);
  if (error) throw new Error(`Failed to save chat message: ${error.message}`);

  // Update session's updated_at timestamp
  await supabase
    .from("chat_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", row.session_id);
}

export async function clearChatMessages(briefId: string): Promise<void> {
  const supabase = await getClient();
  await supabase.from("chat_messages").delete().eq("brief_id", briefId);
}

// Usage tracking — returns the usage record ID for potential rollback
export async function trackUsage(
  userId: string,
  action: string,
  repoFullName?: string,
  tokensUsed?: number
): Promise<string | null> {
  const supabase = await getClient();
  const row: UsageInsert = {
    user_id: userId,
    action,
    repo_full_name: repoFullName ?? null,
    tokens_used: tokensUsed ?? 0,
  };
  const { data } = await supabase.from("usage").insert(row).select("id").single();
  return data?.id ?? null;
}

export async function rollbackUsage(usageId: string): Promise<void> {
  const supabase = await getClient();
  await supabase.from("usage").delete().eq("id", usageId);
}

export async function getUsageCount(
  userId: string,
  action: string,
  since: Date
): Promise<number> {
  const supabase = await getClient();
  const { count, error } = await supabase
    .from("usage")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", action)
    .gte("created_at", since.toISOString());

  if (error) return 0;
  return count ?? 0;
}

// Profile helpers
export async function getProfile(userId: string) {
  const supabase = await getClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  return data;
}

export async function getGitHubToken(userId: string): Promise<string | null> {
  const profile = await getProfile(userId);
  return profile?.github_access_token ?? null;
}

// Convert DB row to ProjectBrief type
function rowToBrief(row: Record<string, unknown>): ProjectBrief {
  return {
    id: row.id as string,
    repoInfo: row.repo_info as unknown as ProjectBrief["repoInfo"],
    generatedAt: row.generated_at as string,
    overview: row.overview as unknown as ProjectBrief["overview"],
    architecture: row.architecture as unknown as ProjectBrief["architecture"],
    features: row.features as unknown as ProjectBrief["features"],
    businessContext:
      row.business_context as unknown as ProjectBrief["businessContext"],
    timeline: row.timeline as unknown as ProjectBrief["timeline"],
    entrypoints: row.entrypoints as unknown as ProjectBrief["entrypoints"],
    ...(row.codemap ? { codemap: row.codemap as unknown as ProjectBrief["codemap"] } : {}),
    ...(row.timeline_data ? { timelineData: row.timeline_data as unknown as ProjectBrief["timelineData"] } : {}),
  };
}
