import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";

// Stripe calls this on subscription changes. The user row is the source of truth for the plan.
export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getStripe, billingEnv } = await import("@/lib/billing");
        const stripe = await getStripe();
        const secret = (await billingEnv()).STRIPE_WEBHOOK_SECRET;
        if (!stripe || !secret) return new Response("billing not configured", { status: 503 });
        const sig = request.headers.get("stripe-signature");
        if (!sig) return new Response("missing signature", { status: 400 });
        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(await request.text(), sig, secret);
        } catch (err) {
          return new Response(`bad signature: ${err instanceof Error ? err.message : "unknown"}`, { status: 400 });
        }

        const { createDb, user } = await import("@openheard/db");
        const { eq } = await import("drizzle-orm");
        const db = createDb();

        async function apply(sub: Stripe.Subscription, fallbackUserId?: string | null) {
          const userId = sub.metadata?.userId || fallbackUserId || null;
          const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
          const active = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
          const end = sub.items.data[0]?.current_period_end;
          const patch = { plan: active ? ("pro" as const) : ("free" as const), stripeSubscriptionId: active ? sub.id : null, planRenewsAt: active && end ? new Date(end * 1000) : null, stripeCustomerId: customer };
          if (userId) await db.update(user).set(patch).where(eq(user.id, userId));
          else await db.update(user).set(patch).where(eq(user.stripeCustomerId, customer));
        }

        switch (event.type) {
          case "checkout.session.completed": {
            const s = event.data.object;
            if (s.mode === "subscription" && s.subscription) {
              const sub = await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
              await apply(sub, s.client_reference_id);
            }
            break;
          }
          case "customer.subscription.created":
          case "customer.subscription.updated":
          case "customer.subscription.deleted":
            await apply(event.data.object);
            break;
          default:
            break;
        }
        return new Response("ok");
      },
    },
  },
});
