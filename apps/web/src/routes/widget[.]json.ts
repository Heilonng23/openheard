import { changelogEntry, createDb } from "@openheard/db";
import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, isNotNull } from "drizzle-orm";

import { workspaceFromRequest } from "@/lib/session";

const CORS = { "access-control-allow-origin": "*", "content-type": "application/json; charset=utf-8" };

// What the loader needs before the panel ever opens: launcher colour, panel
// background, and when the changelog last moved, for the "new" badge. All of
// it is public, so any origin may read it.
export const Route = createFileRoute("/widget.json")({
  server: {
    handlers: {
      GET: async ({ request }) => {
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
