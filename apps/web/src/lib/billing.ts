import Stripe from "stripe";

// Server-only. Every export loads the env lazily so nothing here reaches the client bundle.
type BillingEnv = { STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string; STRIPE_PRICE_MONTHLY?: string; STRIPE_PRICE_YEARLY?: string; BETTER_AUTH_URL?: string };

export async function billingEnv(): Promise<BillingEnv> {
  const { env } = await import("@openheard/env/server");
  return env as unknown as BillingEnv;
}

export async function getStripe(): Promise<Stripe | null> {
  const e = await billingEnv();
  if (!e.STRIPE_SECRET_KEY) return null;
  return new Stripe(e.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
}

export async function priceFor(interval: "month" | "year"): Promise<string> {
  const e = await billingEnv();
  const id = interval === "month" ? e.STRIPE_PRICE_MONTHLY : e.STRIPE_PRICE_YEARLY;
  if (!id) throw new Error("Billing is not configured");
  return id;
}
