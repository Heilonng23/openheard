import { env } from "@openheard/env/server";

type KV = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl: number }): Promise<void>;
};

const memStore = new Map<string, { count: number; expires: number }>();

function getStore(): { get(k: string): Promise<string | null>; put(k: string, v: string, o: { expirationTtl: number }): Promise<void> } {
  const kvBinding = (env as unknown as { CACHE?: KV }).CACHE;
  if (kvBinding) return kvBinding;
  return {
    async get(key: string) {
      const entry = memStore.get(key);
      if (!entry || Date.now() > entry.expires) { memStore.delete(key); return null; }
      return String(entry.count);
    },
    async put(key: string, value: string, opts: { expirationTtl: number }) {
      memStore.set(key, { count: parseInt(value, 10), expires: Date.now() + opts.expirationTtl * 1000 });
    },
  };
}

const DEFAULT_WINDOW = 60;
const DEFAULT_MAX = 60;

export async function rateLimit(
  key: string,
  opts?: { window?: number; max?: number },
): Promise<{ allowed: boolean; retryAfter: number | null }> {
  const store = getStore();
  const window = opts?.window ?? DEFAULT_WINDOW;
  const max = opts?.max ?? DEFAULT_MAX;
  const bucket = Math.floor(Date.now() / 1000 / window);
  const rlKey = `rl:${key}:${bucket}`;

  try {
    const raw = await store.get(rlKey);
    const count = raw ? parseInt(raw, 10) : 0;

    if (count >= max) {
      const bucketStart = bucket * window;
      const retryAfter = bucketStart + window - Math.floor(Date.now() / 1000);
      return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
    }

    await store.put(rlKey, String(count + 1), { expirationTtl: window + 10 });
    return { allowed: true, retryAfter: null };
  } catch {
    return { allowed: true, retryAfter: null };
  }
}

export function rateLimitResponse(retryAfter: number): Response {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(retryAfter),
    },
  });
}
