import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-03-31.basil",
    });
  }
  return _stripe;
}

export const PLANS = {
  free: {
    name: "Free",
    analyses_per_month: 3,
    chat_messages_per_month: 20,
    private_repos: false,
    full_history: false,
  },
  pro: {
    name: "Pro",
    price: 9,
    analyses_per_month: Infinity,
    chat_messages_per_month: Infinity,
    private_repos: true,
    full_history: true,
  },
} as const;
