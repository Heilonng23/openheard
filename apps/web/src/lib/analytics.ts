// Server-only. Revenue is reported from the Stripe webhook rather than the
// browser, so an abandoned success page or a blocked script never loses a sale.
// Every export loads the env lazily, the same way billing.ts does.

// Structural so this file needs no Workers type globals; the real binding fits.
type SeenStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown>;
};

type AnalyticsEnv = { OPENPANEL_CLIENT_ID?: string; OPENPANEL_CLIENT_SECRET?: string; OPENPANEL_URL?: string; CACHE?: SeenStore };

const DEFAULT_API_URL = "https://api.openpanel.dev";
const TRACK_TIMEOUT_MS = 3_000;
// Stripe stops retrying a webhook after a few days; a marker that outlives the
// retries is what keeps one purchase from being counted twice.
const SEEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export type RevenueInput = {
  // Stable per purchase, not per delivery: the Stripe object id.
  dedupeKey: string;
  // Minor units, straight off Stripe.
  amountMinor: number;
  currency: string;
  // Our own user id, or nothing. Never an email or a Stripe customer id.
  profileId?: string | null;
};

export type TrackEvent = { type: "track"; payload: { name: string; profileId?: string; properties: Record<string, unknown> } };

// OpenPanel keeps __revenue in minor units as a whole number and divides by 100
// when it renders, so amount_total goes over untouched. `amount` carries the
// major-unit figure for breakdowns that read properties directly.
export function revenueEvent(input: RevenueInput): TrackEvent {
  const currency = input.currency.toUpperCase();
  return {
    type: "track",
    payload: {
      name: "revenue",
      ...(input.profileId ? { profileId: input.profileId } : {}),
      properties: { __revenue: input.amountMinor, currency, amount: input.amountMinor / 100 },
    },
  };
}

async function analyticsEnv(): Promise<AnalyticsEnv> {
  const { env } = await import("@openheard/env/server");
  return env as unknown as AnalyticsEnv;
}

// waitUntil exists in the Worker but not in the local stand-in; without it the
// send is awaited, which the timeout below keeps short.
async function background(work: Promise<unknown>): Promise<void> {
  try {
    const mod = (await import("cloudflare:workers")) as { waitUntil?: (p: Promise<unknown>) => void };
    if (typeof mod.waitUntil === "function") {
      mod.waitUntil(work);
      return;
    }
  } catch {
    // no Workers runtime here
  }
  await work;
}

// True when the ingest accepted the event. A refusal is a failure like a dead
// socket is: a 401 from a stale secret must not read as a delivered sale.
export async function sendTrack(apiUrl: string, clientId: string, clientSecret: string, event: TrackEvent, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`${apiUrl.replace(/\/$/, "")}/track`, {
      method: "POST",
      headers: { "content-type": "application/json", "openpanel-client-id": clientId, "openpanel-client-secret": clientSecret },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(TRACK_TIMEOUT_MS),
    });
    return Boolean(res?.ok);
  } catch {
    // Analytics never breaks billing: the plan is already written.
    return false;
  }
}

// The marker is written only once the ingest has accepted, so a send that fails
// leaves the key clear and Stripe's next retry reports the sale. The cost is the
// other side of the trade: two retries racing one slow ingest can double-count.
export async function claimAndSend(
  store: SeenStore | undefined,
  apiUrl: string,
  clientId: string,
  clientSecret: string,
  key: string,
  event: TrackEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    if (store && (await store.get(key))) return false;
    if (!(await sendTrack(apiUrl, clientId, clientSecret, event, fetchImpl))) return false;
    await store?.put(key, "1", { expirationTtl: SEEN_TTL_SECONDS });
    return true;
  } catch {
    return false;
  }
}

export async function trackRevenue(input: RevenueInput): Promise<void> {
  try {
    const e = await analyticsEnv();
    // Unset vars mean a self-hoster with no OpenPanel: send nothing, say nothing.
    if (!e.OPENPANEL_CLIENT_ID || !e.OPENPANEL_CLIENT_SECRET) return;
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) return;
    // Check, send and mark travel together so the marker lands after the send,
    // whoever ends up awaiting it.
    await background(
      claimAndSend(e.CACHE, e.OPENPANEL_URL || DEFAULT_API_URL, e.OPENPANEL_CLIENT_ID, e.OPENPANEL_CLIENT_SECRET, `revenue:${input.dedupeKey}`, revenueEvent(input)),
    );
  } catch {
    // Same reason as above.
  }
}
