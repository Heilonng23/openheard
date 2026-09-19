import { createDb, membership, user } from "@openheard/db";
import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { PLANS } from "@/lib/plans";
import { assertNotDemo, assertNotDemoIdentity } from "@/lib/demo";
import { requireUser, sessionMiddleware } from "@/lib/session";

// Plan, limits and usage for the signed-in account.
export const getBilling = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const u = requireUser(context.user);
    assertNotDemoIdentity(u);
    const db = createDb();
    const [row] = await db.select({ plan: user.plan, renewsAt: user.planRenewsAt, customer: user.stripeCustomerId }).from(user).where(eq(user.id, u.id)).limit(1);
    const [{ n: owned }] = await db.select({ n: count() }).from(membership).where(and(eq(membership.userId, u.id), eq(membership.role, "admin"), ne(membership.workspaceId, "default")));
    const { billingEnv } = await import("@/lib/billing");
    const e = await billingEnv();
    const plan = row?.plan ?? "free";
    return { plan, renewsAt: row?.renewsAt ?? null, owned, limit: PLANS[plan].workspaces, hasCustomer: !!row?.customer, configured: !!e.STRIPE_SECRET_KEY };
  });

// Stripe Checkout for Pro. Returns the URL to send the browser to.
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ interval: z.enum(["month", "year"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const u = requireUser(context.user);
    assertNotDemo(context.workspace);
    assertNotDemoIdentity(u);
    const { getStripe, priceFor, billingEnv } = await import("@/lib/billing");
    const stripe = await getStripe();
    if (!stripe) throw new Error("Billing is not configured");
    const db = createDb();
    const [row] = await db.select({ customer: user.stripeCustomerId, plan: user.plan }).from(user).where(eq(user.id, u.id)).limit(1);
    if (row?.plan === "pro") throw new Error("You are already on Pro");
    let customer = row?.customer ?? null;
    if (!customer) {
      const c = await stripe.customers.create({ email: u.email, name: u.name, metadata: { userId: u.id } });
      customer = c.id;
      await db.update(user).set({ stripeCustomerId: customer }).where(eq(user.id, u.id));
    }
    const base = (await billingEnv()).BETTER_AUTH_URL || "http://localhost:3001";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: u.id,
      line_items: [{ price: await priceFor(data.interval), quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${base}/dashboard/settings/billing?checkout=success`,
      cancel_url: `${base}/dashboard/settings/billing`,
      subscription_data: { metadata: { userId: u.id } },
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url };
  });

// Stripe Customer Portal: change plan, update card, cancel.
export const openPortal = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const u = requireUser(context.user);
    assertNotDemo(context.workspace);
    assertNotDemoIdentity(u);
    const { getStripe, billingEnv } = await import("@/lib/billing");
    const stripe = await getStripe();
    if (!stripe) throw new Error("Billing is not configured");
    const db = createDb();
    const [row] = await db.select({ customer: user.stripeCustomerId }).from(user).where(eq(user.id, u.id)).limit(1);
    if (!row?.customer) throw new Error("No billing account yet");
    const base = (await billingEnv()).BETTER_AUTH_URL || "http://localhost:3001";
    const session = await stripe.billingPortal.sessions.create({ customer: row.customer, return_url: `${base}/dashboard/settings/billing` });
    return { url: session.url };
  });
