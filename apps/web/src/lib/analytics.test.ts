// The webhook cannot be exercised without a live Stripe, so this covers the
// two parts that decide whether revenue reads correctly: the payload shape
// OpenPanel expects, and the promise that a dead ingest never throws.
import { describe, expect, it, vi } from "vitest";

import { claimAndSend, revenueEvent, sendTrack } from "./analytics";

function fakeStore() {
  const map = new Map<string, string>();
  return {
    map,
    get: async (k: string) => map.get(k) ?? null,
    put: async (k: string, v: string) => void map.set(k, v),
  };
}

describe("the revenue event", () => {
  it("carries the Stripe amount in minor units, as a whole number", () => {
    const e = revenueEvent({ dedupeKey: "obj_x", amountMinor: 1234, currency: "usd" });
    expect(e.payload.name).toBe("revenue");
    expect(e.payload.properties.__revenue).toBe(1234);
    expect(Number.isInteger(e.payload.properties.__revenue)).toBe(true);
    expect(e.payload.properties.amount).toBe(12.34);
    expect(e.payload.properties.currency).toBe("USD");
  });

  it("sends our own user id and nothing else about the buyer", () => {
    const e = revenueEvent({ dedupeKey: "obj_x", amountMinor: 100, currency: "eur", profileId: "usr_1" });
    expect(e.payload.profileId).toBe("usr_1");
    expect(JSON.stringify(e)).not.toMatch(/@/);
  });

  it("omits the profile rather than sending an empty one", () => {
    expect(revenueEvent({ dedupeKey: "obj_x", amountMinor: 100, currency: "eur", profileId: null }).payload).not.toHaveProperty("profileId");
  });
});

describe("the ingest call", () => {
  it("authenticates with the client id and secret", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}"));
    await sendTrack("https://ingest.example/", "id", "secret", revenueEvent({ dedupeKey: "obj_x", amountMinor: 100, currency: "usd" }), fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ingest.example/track");
    expect((init.headers as Record<string, string>)["openpanel-client-id"]).toBe("id");
    expect((init.headers as Record<string, string>)["openpanel-client-secret"]).toBe("secret");
  });

  it("swallows a failing ingest so the webhook still answers Stripe", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("down"));
    await expect(sendTrack("https://ingest.example", "id", "secret", revenueEvent({ dedupeKey: "obj_x", amountMinor: 100, currency: "usd" }), fetchImpl as unknown as typeof fetch)).resolves.toBe(false);
  });

  it("reads a refused post as a failure, not a delivery", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 401 }));
    await expect(sendTrack("https://ingest.example", "id", "bad", revenueEvent({ dedupeKey: "obj_x", amountMinor: 100, currency: "usd" }), fetchImpl as unknown as typeof fetch)).resolves.toBe(false);
  });
});

describe("counting a sale once", () => {
  const event = revenueEvent({ dedupeKey: "obj_x", amountMinor: 100, currency: "usd" });
  const send = (store: ReturnType<typeof fakeStore>, fetchImpl: unknown) =>
    claimAndSend(store, "https://ingest.example", "id", "secret", "revenue:obj_x", event, fetchImpl as typeof fetch);

  it("leaves the key unmarked when the ingest fails, so the retry re-sends", async () => {
    const store = fakeStore();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("down"));
    await expect(send(store, fetchImpl)).resolves.toBe(false);
    expect(store.map.size).toBe(0);

    fetchImpl.mockResolvedValue(new Response("{}"));
    await expect(send(store, fetchImpl)).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("leaves the key unmarked when the ingest answers non-2xx", async () => {
    const store = fakeStore();
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 401 }));
    await expect(send(store, fetchImpl)).resolves.toBe(false);
    expect(store.map.size).toBe(0);
  });

  it("marks an accepted sale and skips the send on a retry", async () => {
    const store = fakeStore();
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}"));
    await expect(send(store, fetchImpl)).resolves.toBe(true);
    expect(store.map.get("revenue:obj_x")).toBe("1");

    await expect(send(store, fetchImpl)).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
