import { env } from "@openheard/env/server";

type KV = { get(key: string, opts?: { type: "json" }): Promise<unknown>; put(key: string, value: string, opts?: { expirationTtl: number }): Promise<void>; delete(key: string): Promise<void> };

function kv(): KV | null {
  return (env as unknown as { CACHE?: KV }).CACHE ?? null;
}

const TTL = 60;

export async function getCached<T>(key: string): Promise<T | null> {
  const store = kv();
  if (!store) return null;
  try {
    return (await store.get(key, { type: "json" })) as T | null;
  } catch {
    return null;
  }
}

export async function setCached(key: string, value: unknown): Promise<void> {
  const store = kv();
  if (!store) return;
  try {
    await store.put(key, JSON.stringify(value), { expirationTtl: TTL });
  } catch {
    // KV write failure is non-fatal
  }
}

export async function invalidate(...keys: string[]): Promise<void> {
  const store = kv();
  if (!store) return;
  await Promise.all(keys.map((k) => store.delete(k).catch(() => {})));
}
