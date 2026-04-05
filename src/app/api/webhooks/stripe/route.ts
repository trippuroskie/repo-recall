import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeEvent = any;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: StripeEvent;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = await createServiceClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.supabase_user_id;
      if (userId && session.subscription) {
        const subscription = await getStripe().subscriptions.retrieve(
          session.subscription as string
        ) as unknown as Record<string, unknown>;
        const periodEnd = subscription.current_period_end as number;
        await supabase
          .from("profiles")
          .update({
            stripe_customer_id: session.customer as string,
            subscription_status: "pro",
            subscription_period_end: periodEnd
              ? new Date(periodEnd * 1000).toISOString()
              : null,
          })
          .eq("id", userId);
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Record<string, unknown>;
      const customerId = subscription.customer as string;
      const status =
        subscription.status === "active" ? "pro" : "cancelled";
      const periodEnd = subscription.current_period_end as number;

      await supabase
        .from("profiles")
        .update({
          subscription_status: status,
          subscription_period_end: periodEnd
            ? new Date(periodEnd * 1000).toISOString()
            : null,
        })
        .eq("stripe_customer_id", customerId);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Record<string, unknown>;
      const customerId = subscription.customer as string;

      await supabase
        .from("profiles")
        .update({
          subscription_status: "free",
          subscription_period_end: null,
        })
        .eq("stripe_customer_id", customerId);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
