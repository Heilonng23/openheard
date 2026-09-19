import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { hasSessionCookie, isPrivatePath, isPublicCacheable } from "./lib/cache";

const handler = createStartHandler(defaultStreamHandler);

const REQUEST_TIMEOUT_MS = 25_000;
const MAX_CACHEABLE_BODY = 2 * 1024 * 1024;

function getEdgeCache(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return null;
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

function secure(response: Response): Response {
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request: Request, _env: unknown, ctx: ExecutionContext) {
    return secure(await handle(request, ctx));
  },
  // Nightly: the public demo workspace goes back to its seed. Bindings come
  // from `cloudflare:workers`, which is live in a scheduled invocation too.
  async scheduled(_controller: ScheduledController, _env: unknown, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        const [{ createDb }, { resetDemoWorkspace }] = await Promise.all([import("@openheard/db"), import("./lib/demo-db")]);
        const { posts } = await resetDemoWorkspace(createDb());
        console.log(`demo reset: ${posts} posts`);
      })(),
    );
  },
};

async function handle(request: Request, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const cache = getEdgeCache();

  if (
    cache &&
    request.method === "GET" &&
    !hasSessionCookie(request) &&
    isPublicCacheable(url.pathname)
  ) {
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) {
      const resp = new Response(cached.body, cached);
      resp.headers.set("x-cache", "HIT");
      resp.headers.set("cache-control", "public, max-age=0, s-maxage=60");
      return resp;
    }

    const response = await bounded(request, url);

    if (response.status === 200) {
      const contentLength = parseInt(response.headers.get("content-length") ?? "", 10);
      const tooLarge = !isNaN(contentLength) && contentLength > MAX_CACHEABLE_BODY;

      if (!tooLarge) {
        const body = await response.arrayBuffer();

        if (body.byteLength <= MAX_CACHEABLE_BODY) {
          const stored = new Response(body, response);
          stored.headers.set("cache-control", "public, s-maxage=60");
          stored.headers.delete("set-cookie");
          stored.headers.delete("vary");
          ctx.waitUntil(cache.put(cacheKey, stored));
        }

        const out = new Response(body, response);
        out.headers.set("x-cache", "MISS");
        out.headers.set("cache-control", "public, max-age=0, s-maxage=60");
        return out;
      }
    }

    const out = new Response(response.body, response);
    out.headers.set("x-cache", "MISS");
    out.headers.set("cache-control", "public, max-age=0, s-maxage=60");
    return out;
  }

  const response = await bounded(request, url);

  if (isPrivatePath(url.pathname) || hasSessionCookie(request)) {
    const out = new Response(response.body, response);
    out.headers.set("cache-control", "private, no-store");
    return out;
  }

  return response;
}

function bounded(request: Request, url: URL): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => {
      console.error(`request timeout: ${request.method} ${url.host}${url.pathname}`);
      resolve(new Response("Service temporarily unavailable", {
        status: 503,
        headers: { "content-type": "text/plain" },
      }));
    }, REQUEST_TIMEOUT_MS);

    Promise.resolve(handler(request)).then(
      (res: Response) => { clearTimeout(timer); resolve(res); },
      (err: unknown) => { clearTimeout(timer); reject(err); },
    );
  });
}
