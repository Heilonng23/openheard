// Help center reads, shared by the server functions, the HTTP API, MCP and
// (later) the widget. Server only: import from functions and API routes, never
// from a route component.
import type { Db } from "@openheard/db";
import { user } from "@openheard/db/schema/auth";
import { helpArticle, helpCollection } from "@openheard/db/schema/help";
import { and, asc, desc, eq, notInArray, sql, type SQL } from "drizzle-orm";

import { escapeLike, searchTerms, summary } from "./help";

export type HelpSearchHit = { id: number; slug: string; title: string; excerpt: string; collection: { slug: string; title: string } | null };

const published = (workspaceId: string) => and(eq(helpArticle.workspaceId, workspaceId), eq(helpArticle.status, "published"));

// A title hit is worth three body hits, an excerpt hit two. Each query word
// scores on its own, so an article matching more of the words ranks higher.
function scoreFor(terms: string[]): SQL<number> {
  const parts = terms.map((w) => {
    const p = `%${escapeLike(w)}%`;
    return sql`(case when lower(${helpArticle.title}) like ${p} escape '\\' then 3 else 0 end + case when lower(coalesce(${helpArticle.excerpt}, '')) like ${p} escape '\\' then 2 else 0 end + case when lower(${helpArticle.body}) like ${p} escape '\\' then 1 else 0 end)`;
  });
  return sql.join(parts, sql` + `) as SQL<number>;
}

// Published articles only. `minScore` lets the new-post suggestions ask for a
// stronger match than the search box does: one title word, or two body words.
export async function searchHelpArticles(db: Db, workspaceId: string, q: string, opts: { limit?: number; minScore?: number } = {}): Promise<HelpSearchHit[]> {
  const terms = searchTerms(q);
  if (!terms.length) return [];
  const score = scoreFor(terms);
  const rows = await db
    .select({
      id: helpArticle.id,
      slug: helpArticle.slug,
      title: helpArticle.title,
      excerpt: helpArticle.excerpt,
      body: helpArticle.body,
      score: score.as("score"),
      collectionSlug: helpCollection.slug,
      collectionTitle: helpCollection.title,
    })
    .from(helpArticle)
    .leftJoin(helpCollection, eq(helpCollection.id, helpArticle.collectionId))
    .where(and(published(workspaceId), sql`${score} >= ${Math.max(1, opts.minScore ?? 1)}`))
    .orderBy(desc(sql`score`), asc(helpArticle.position), asc(helpArticle.title))
    .limit(Math.min(Math.max(Math.trunc(Number.isFinite(opts.limit) ? opts.limit! : 8), 1), 25));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt || summary(r.body, 140),
    collection: r.collectionSlug ? { slug: r.collectionSlug, title: r.collectionTitle! } : null,
  }));
}

// Collections in order, each with its published articles. Collections with
// nothing published are left out; so are uncategorised articles' empty group.
export async function helpCenterIndex(db: Db, workspaceId: string) {
  const [collections, articles] = await Promise.all([
    db.select({ id: helpCollection.id, slug: helpCollection.slug, title: helpCollection.title, description: helpCollection.description, icon: helpCollection.icon }).from(helpCollection).where(eq(helpCollection.workspaceId, workspaceId)).orderBy(asc(helpCollection.position), asc(helpCollection.id)),
    db
      .select({ id: helpArticle.id, slug: helpArticle.slug, title: helpArticle.title, excerpt: helpArticle.excerpt, body: helpArticle.body, collectionId: helpArticle.collectionId, helpfulCount: helpArticle.helpfulCount, updatedAt: helpArticle.updatedAt })
      .from(helpArticle)
      .where(published(workspaceId))
      .orderBy(asc(helpArticle.position), asc(helpArticle.id)),
  ]);
  const slim = articles.map(({ body, helpfulCount, ...a }) => ({ ...a, excerpt: a.excerpt || summary(body, 140) }));
  const grouped = collections.map((c) => ({ ...c, articles: slim.filter((a) => a.collectionId === c.id) })).filter((c) => c.articles.length);
  const loose = slim.filter((a) => a.collectionId === null || !collections.some((c) => c.id === a.collectionId));
  // "Popular" is whatever readers found most helpful. Ties keep the team's order.
  const popular = [...articles]
    .sort((a, b) => b.helpfulCount - a.helpfulCount)
    .slice(0, 3)
    .map((a) => ({ slug: a.slug, title: a.title, collection: collections.find((c) => c.id === a.collectionId)?.title ?? null }));
  return { collections: grouped, uncategorised: loose, popular, total: slim.length };
}

// One article by slug. Drafts only when the caller is on the team.
export async function helpArticleBySlug(db: Db, workspaceId: string, slug: string, opts: { drafts?: boolean } = {}) {
  const [row] = await db
    .select({
      id: helpArticle.id,
      slug: helpArticle.slug,
      title: helpArticle.title,
      excerpt: helpArticle.excerpt,
      body: helpArticle.body,
      status: helpArticle.status,
      collectionId: helpArticle.collectionId,
      helpfulCount: helpArticle.helpfulCount,
      unhelpfulCount: helpArticle.unhelpfulCount,
      publishedAt: helpArticle.publishedAt,
      updatedAt: helpArticle.updatedAt,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(helpArticle)
    .leftJoin(user, eq(user.id, helpArticle.authorId))
    .where(and(eq(helpArticle.workspaceId, workspaceId), eq(helpArticle.slug, slug), opts.drafts ? undefined : eq(helpArticle.status, "published")))
    .limit(1);
  if (!row) return null;
  const collection = row.collectionId
    ? ((await db.select({ id: helpCollection.id, slug: helpCollection.slug, title: helpCollection.title, icon: helpCollection.icon }).from(helpCollection).where(and(eq(helpCollection.id, row.collectionId), eq(helpCollection.workspaceId, workspaceId))).limit(1))[0] ?? null)
    : null;
  // Related: the rest of this collection first, topped up with the most
  // helpful articles elsewhere.
  const relatedCols = { slug: helpArticle.slug, title: helpArticle.title, collection: helpCollection.title };
  const sameCollection = collection
    ? await db
        .select(relatedCols)
        .from(helpArticle)
        .leftJoin(helpCollection, eq(helpCollection.id, helpArticle.collectionId))
        .where(and(published(workspaceId), eq(helpArticle.collectionId, collection.id), sql`${helpArticle.id} != ${row.id}`))
        .orderBy(asc(helpArticle.position), asc(helpArticle.id))
        .limit(3)
    : [];
  const elsewhere =
    sameCollection.length < 3
      ? await db
          .select(relatedCols)
          .from(helpArticle)
          .leftJoin(helpCollection, eq(helpCollection.id, helpArticle.collectionId))
          .where(and(published(workspaceId), sql`${helpArticle.id} != ${row.id}`, sameCollection.length ? notInArray(helpArticle.slug, sameCollection.map((r) => r.slug)) : undefined))
          .orderBy(desc(helpArticle.helpfulCount), asc(helpArticle.position))
          .limit(3 - sameCollection.length)
      : [];
  const { authorName, authorImage, ...article } = row;
  return { ...article, excerpt: row.excerpt || summary(row.body), author: authorName ? { name: authorName, image: authorImage } : null, collection, related: [...sameCollection, ...elsewhere] };
}

export async function helpCollectionBySlug(db: Db, workspaceId: string, slug: string) {
  const [c] = await db.select({ id: helpCollection.id, slug: helpCollection.slug, title: helpCollection.title, description: helpCollection.description, icon: helpCollection.icon }).from(helpCollection).where(and(eq(helpCollection.workspaceId, workspaceId), eq(helpCollection.slug, slug))).limit(1);
  if (!c) return null;
  const articles = await db
    .select({ id: helpArticle.id, slug: helpArticle.slug, title: helpArticle.title, excerpt: helpArticle.excerpt, body: helpArticle.body })
    .from(helpArticle)
    .where(and(published(workspaceId), eq(helpArticle.collectionId, c.id)))
    .orderBy(asc(helpArticle.position), asc(helpArticle.id));
  return { ...c, articles: articles.map(({ body, ...a }) => ({ ...a, excerpt: a.excerpt || summary(body, 140) })) };
}

export async function publishedHelpCount(db: Db, workspaceId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(helpArticle).where(published(workspaceId));
  return Number(row?.n ?? 0);
}
