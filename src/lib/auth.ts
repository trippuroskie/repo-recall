import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

const DEV_MOCK_USER: User = {
  id: "00000000-0000-0000-0000-000000000000",
  aud: "authenticated",
  role: "authenticated",
  email: "dev@localhost",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
} as User;

function isDevBypass() {
  return process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV === "development";
}

export async function getAuthUser() {
  if (isDevBypass()) return DEV_MOCK_USER;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireAuth() {
  const user = await getAuthUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}
