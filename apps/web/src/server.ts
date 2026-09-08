import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { hasSessionCookie, isPrivatePath, isPublicCacheable } from "./lib/cache";

const handler = createStartHandler(defaultStreamHandler);

function getEdgeCache(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const cache = getEdgeCache();

    if (
      cache &&
      request.method === "GET" &&
      !hasSessionCookie(request) &&
      isPublicCacheable(url.pathname)
    ) {
      const cached = await cache.match(request);
      if (cached) {
        const resp = new Response(cached.body, cached);
        resp.headers.set("x-cache", "HIT");
        return resp;
      }

      const response = await handler(request);
      if (response.status === 200) {
        const cloned = response.clone();
        const stored = new Response(cloned.body, cloned);
        stored.headers.set("cache-control", "public, s-maxage=60, stale-while-revalidate=300");
        stored.headers.delete("set-cookie");
        cache.put(request, stored);
      }

      const out = new Response(response.body, response);
      out.headers.set("x-cache", "MISS");
      out.headers.set("cache-control", "public, s-maxage=60, stale-while-revalidate=300");
      return out;
    }

    const response = await handler(request);

    if (isPrivatePath(url.pathname) || hasSessionCookie(request)) {
      const out = new Response(response.body, response);
      out.headers.set("cache-control", "private, no-store");
      return out;
    }

    return response;
  },
};
