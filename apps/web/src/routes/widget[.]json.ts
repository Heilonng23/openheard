import { createFileRoute } from "@tanstack/react-router";

const CORS = { "access-control-allow-origin": "*", "content-type": "application/json; charset=utf-8" };

// What the loader needs before the panel ever opens: launcher colour, panel
// background, and when the changelog last moved, for the "new" badge. All of
// it is public, so any origin may read it. The edge caches it per workspace
// (see edgeCacheKey); the rate limit is for whatever gets past that.
export const Route = createFileRoute("/widget.json")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Server-only modules load here, never at the top: this file is a
        // route, and routes are reachable from the client bundle.
        const [{ changelogEntry, createDb }, { and, desc, eq, isNotNull }, { workspaceFromRequest }, { rateLimit, rateLimitResponse }] = await Promise.all([
          import("@openheard/db"),
          import("drizzle-orm"),
          import("@/lib/session"),
          import("@/lib/rate-limit"),
        ]);
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        const limited = await rateLimit(`widget-json:${ip}`, { window: 60, max: 120 });
        if (!limited.allowed) {
          const res = rateLimitResponse(limited.retryAfter ?? 60);
          res.headers.set("access-control-allow-origin", "*");
          return res;
        }
        const ws = await workspaceFromRequest(request);
        if (!ws) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: CORS });
        const [latest] = ws.showChangelog
          ? await createDb()
              .select({ at: changelogEntry.publishedAt })
              .from(changelogEntry)
              .where(and(eq(changelogEntry.workspaceId, ws.id), isNotNull(changelogEntry.publishedAt)))
              .orderBy(desc(changelogEntry.publishedAt))
              .limit(1)
          : [];
        const body = {
          name: ws.name,
          accent: ws.accent,
          theme: ws.theme === "light" ? "light" : "dark",
          changelog: ws.showChangelog,
          latestChangelogAt: latest?.at ? new Date(latest.at).getTime() : null,
        };
        return new Response(JSON.stringify(body), { headers: { ...CORS, "cache-control": "public, max-age=60" } });
      },
    },
  },
});
