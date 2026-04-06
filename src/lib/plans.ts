import { getProfile, getUsageCount } from "./store";
import { PLANS } from "./stripe";

export interface PlanLimits {
  canAnalyze: boolean;
  canChat: boolean;
  canAccessPrivateRepos: boolean;
  canAccessFullHistory: boolean;
  plan: "free" | "pro";
  analyzesUsed: number;
  analyzesLimit: number;
  chatUsed: number;
  chatLimit: number;
}

export async function checkPlanLimits(userId: string): Promise<PlanLimits> {
  const profile = await getProfile(userId);
  const plan =
    profile?.subscription_status === "pro" ? "pro" : "free";
  const limits = PLANS[plan];

  // Use actual Stripe billing period for Pro users,
  // fall back to calendar month for free users or pre-migration Pro users
  let periodStart: Date;
  if (plan === "pro" && profile?.subscription_period_start) {
    periodStart = new Date(profile.subscription_period_start);
  } else {
    const now = new Date();
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const [analyzesUsed, chatUsed] = await Promise.all([
    getUsageCount(userId, "analyze", periodStart),
    getUsageCount(userId, "chat_message", periodStart),
  ]);

  return {
    plan,
    canAnalyze: analyzesUsed < limits.analyses_per_month,
    canChat: chatUsed < limits.chat_messages_per_month,
    canAccessPrivateRepos: limits.private_repos,
    canAccessFullHistory: limits.full_history,
    analyzesUsed,
    analyzesLimit: limits.analyses_per_month,
    chatUsed,
    chatLimit: limits.chat_messages_per_month,
  };
}
