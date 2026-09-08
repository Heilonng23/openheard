import { changelogEntry, createDb } from "@openheard/db";
import { workspaceFromRequest } from "@/lib/session";
import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, isNotNull } from "drizzle-orm";

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

// Published changelog entries as RSS 2.0. Readers, Slack, and Zapier all eat this.
export const Route = createFileRoute("/changelog.rss")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const db = createDb();
        const ws = await workspaceFromRequest(request);
        if (!ws) return new Response("Not found", { status: 404 });
        const entries = await db
          .select()
          .from(changelogEntry)
          .where(and(eq(changelogEntry.workspaceId, ws.id), isNotNull(changelogEntry.publishedAt)))
          .orderBy(desc(changelogEntry.publishedAt))
          .limit(50);
        const origin = new URL(request.url).origin;
        const name = ws?.name ?? "openheard";
        const items = entries
          .map(
            (e) => `    <item>
      <title>${esc(e.version ? `${e.version} · ${e.title}` : e.title)}</title>
      <link>${origin}/changelog</link>
      <guid isPermaLink="false">changelog-${e.id}</guid>
      <pubDate>${new Date(e.publishedAt!).toUTCString()}</pubDate>
      <description>${esc(e.body)}</description>
    </item>`,
          )
          .join("\n");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(name)} changelog</title>
    <link>${origin}/changelog</link>
    <description>What shipped, and the posts it closed.</description>
${items}
  </channel>
</rss>`;
        return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300" } });
      },
    },
  },
});
