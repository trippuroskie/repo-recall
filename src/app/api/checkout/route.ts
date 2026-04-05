import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { requireAuth } from "@/lib/auth";
import { getProfile } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const profile = await getProfile(user.id);

    // Get or create Stripe customer
    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      // Store the customer ID
      const supabase = await createClient();
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    if (!priceId) {
      return NextResponse.json(
        { error: "Stripe price not configured" },
        { status: 500 }
      );
    }

    const { origin } = new URL(request.url);

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/billing?success=true`,
      cancel_url: `${origin}/billing?cancelled=true`,
      metadata: { supabase_user_id: user.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
