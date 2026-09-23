import { env } from "@openheard/env/server";

type KV = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl: number }): Promise<void>;
  // Present on a Durable-Object-backed store. KV proper has no atomic counter.
  increment?(key: string, ttl: number): Promise<number>;
};

const memStore = new Map<string, { count: number; expires: number }>();

function getStore(): KV {
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

// `failClosed` is for endpoints that hand out something valuable. Everywhere
// else a limiter outage should not take the site down with it.
export async function rateLimit(
  key: string,
  opts?: { window?: number; max?: number; failClosed?: boolean },
): Promise<{ allowed: boolean; retryAfter: number | null }> {
  const store = getStore();
  const window = opts?.window ?? DEFAULT_WINDOW;
  const max = opts?.max ?? DEFAULT_MAX;
  const bucket = Math.floor(Date.now() / 1000 / window);
  const rlKey = `rl:${key}:${bucket}`;
  const retryAfter = () => Math.max(bucket * window + window - Math.floor(Date.now() / 1000), 1);

  try {
    // Reserve the slot, then judge it. Read-then-write lets concurrent
    // requests all read the same stale count and all be let through.
    const taken = store.increment
      ? await store.increment(rlKey, window + 10)
      : await (async () => {
          const raw = await store.get(rlKey);
          const next = (raw ? parseInt(raw, 10) : 0) + 1;
          await store.put(rlKey, String(next), { expirationTtl: window + 10 });
          return next;
        })();
    if (taken > max) return { allowed: false, retryAfter: retryAfter() };
    return { allowed: true, retryAfter: null };
  } catch {
    if (opts?.failClosed) return { allowed: false, retryAfter: retryAfter() };
    return { allowed: true, retryAfter: null };
  }
}

// Cloudflare's Rate Limiting binding: counted at the edge, so parallel requests
// cannot all read the same stale count. Local dev gets an in-memory stand-in
// from packages/env/src/local.ts.
type Limiter = { limit(opts: { key: string }): Promise<{ success: boolean }> };

// Image uploads cost storage, so every check fails closed: no binding, or a
// binding that throws, means no upload.
export async function uploadAllowed(userId: string, ip: string | null): Promise<boolean> {
  const bindings = env as unknown as { UPLOAD_USER_LIMIT?: Limiter; UPLOAD_IP_LIMIT?: Limiter };
  const perUser = bindings.UPLOAD_USER_LIMIT;
  const perIp = bindings.UPLOAD_IP_LIMIT;
  if (!perUser || !perIp) return false;
  try {
    const checks = [perUser.limit({ key: userId })];
    if (ip) checks.push(perIp.limit({ key: ip }));
    return (await Promise.all(checks)).every((r) => r.success);
  } catch {
    return false;
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
