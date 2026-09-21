// Better Auth's secondary storage, backed by a Workers KV namespace. Lives on
// its own so it can be exercised without pulling in the database or the
// server environment.
import type { SecondaryStorage } from "better-auth";

export type KV = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

export function createKvSecondaryStorage(store: KV): SecondaryStorage {
  return {
    async get(key: string) {
      const raw = await store.get(key);
      if (raw === null) return null;
      try { return JSON.parse(raw); } catch { return raw; }
    },
    async getAndDelete(key: string) {
      const raw = await store.get(key);
      if (raw !== null) await store.delete(key);
      if (raw === null) return null;
      try { return JSON.parse(raw); } catch { return raw; }
    },
    async increment(key: string, ttl: number) {
      const raw = await store.get(key);
      const next = (raw ? parseInt(raw, 10) : 0) + 1;
      await store.put(key, String(next), { expirationTtl: ttl });
      return next;
    },
    async set(key: string, value: string, ttl?: number) {
      await store.put(key, value, ttl ? { expirationTtl: ttl } : { expirationTtl: 3600 });
    },
    async delete(key: string) {
      await store.delete(key);
    },
  };
}
