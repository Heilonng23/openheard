import { createDb, helpArticle, helpCollection, post } from "@openheard/db";
import { workspaceFromRequest } from "@/lib/session";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq, sql } from "drizzle-orm";

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const db = createDb();
        const origin = new URL(request.url).origin;
        const ws = await workspaceFromRequest(request);

        const staticPages = ["/", "/roadmap", "/changelog", "/privacy", "/terms"];
        const urls: string[] = staticPages.map(
          (path) =>
            `  <url><loc>${esc(origin + path)}</loc><changefreq>weekly</changefreq></url>`,
        );

        if (ws) {
          const posts = await db
            .select({ id: post.id, updatedAt: post.updatedAt })
            .from(post)
            .where(and(eq(post.workspaceId, ws.id), sql`${post.mergedIntoId} is null`))
            .limit(5000);

          for (const p of posts) {
            const lastmod = new Date(p.updatedAt).toISOString().split("T")[0];
            urls.push(
              `  <url><loc>${esc(`${origin}/p/${p.id}`)}</loc><lastmod>${lastmod}</lastmod></url>`,
            );
          }

          // Help center: the index, every collection with something
          // published, and every published article.
          const articles = await db
            .select({ slug: helpArticle.slug, collectionId: helpArticle.collectionId, updatedAt: helpArticle.updatedAt })
            .from(helpArticle)
            .where(and(eq(helpArticle.workspaceId, ws.id), eq(helpArticle.status, "published")))
            .limit(5000);
          if (articles.length) {
            urls.push(`  <url><loc>${esc(origin + "/help")}</loc><changefreq>weekly</changefreq></url>`);
            const collections = await db.select({ id: helpCollection.id, slug: helpCollection.slug }).from(helpCollection).where(eq(helpCollection.workspaceId, ws.id));
            for (const c of collections) {
              if (articles.some((a) => a.collectionId === c.id)) urls.push(`  <url><loc>${esc(`${origin}/help/collections/${c.slug}`)}</loc><changefreq>weekly</changefreq></url>`);
            }
            for (const a of articles) {
              const lastmod = new Date(a.updatedAt).toISOString().split("T")[0];
              urls.push(`  <url><loc>${esc(`${origin}/help/${a.slug}`)}</loc><lastmod>${lastmod}</lastmod></url>`);
            }
          }
        }

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

        return new Response(xml, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
