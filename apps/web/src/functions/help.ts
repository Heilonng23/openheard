import { createDb, helpArticle, helpArticleFeedback, helpCollection } from "@openheard/db";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { HELP_SLUG, uniqueSlug } from "@/lib/help";
import { helpArticleBySlug, helpCenterIndex, helpCollectionBySlug, searchHelpArticles } from "@/lib/help-db";
import { invalidate } from "@/lib/kv-cache";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser, sessionMiddleware, type SessionUser } from "@/lib/session";

// Admins and members write the help center. Guests (signed-in board users
// who are not on the team) only read it.
function requireTeam(user: SessionUser | null): SessionUser {
  const u = requireUser(user);
  if (u.role !== "admin" && u.role !== "member") throw new Error("Only the team can edit the help center");
  return u;
}

const isTeam = (user: SessionUser | null) => user?.role === "admin" || user?.role === "member";

// The header shows "help" once something is published, and that count lives
// in the cached workspace data.
const refreshShell = (workspaceId: string) => invalidate(`workspace:${workspaceId}`);

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .refine((s) => s === "" || HELP_SLUG.test(s), "Use lowercase letters, numbers and dashes");

// ---------------------------------------------------------------------------
// Public reads

export const getHelpCenter = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => helpCenterIndex(createDb(), context.workspace.id));

export const getHelpCollection = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ slug: z.string().max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = createDb();
    const [collection, index] = await Promise.all([helpCollectionBySlug(db, context.workspace.id, data.slug), helpCenterIndex(db, context.workspace.id)]);
    if (!collection) return null;
    return { collection, collections: index.collections.map((c) => ({ slug: c.slug, title: c.title, count: c.articles.length })) };
  });

export const getHelpArticle = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ slug: z.string().max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    // Null rather than a throw, so the route can answer with a real 404.
    return helpArticleBySlug(createDb(), context.workspace.id, data.slug, { drafts: isTeam(context.user) });
  });

export const searchHelp = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ q: z.string().trim().min(1).max(120), limit: z.number().int().min(1).max(25).optional(), suggest: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) =>
    // Suggestions under the new-post title want a real match, not any article
    // that mentions one of the words somewhere in its body.
    searchHelpArticles(createDb(), context.workspace.id, data.q, { limit: data.limit ?? (data.suggest ? 3 : 8), minScore: data.suggest ? 2 : 1 }),
  );

// "Was this helpful?" One answer per reader per article: signed-in readers by
// account, everyone else by the browser token they already use for anonymous
// votes. Answering again changes the answer rather than adding one.
export const voteHelpArticle = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ articleId: z.number().int(), helpful: z.boolean(), anonToken: z.string().min(16).max(64).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const request = getRequest();
    const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await rateLimit(`help-vote:${ip}`, { window: 60, max: 20 });
    if (!rl.allowed) throw new Error("Too many answers. Try again in a minute.");

    const voter = context.user ? `u:${context.user.id}` : data.anonToken ? `a:${data.anonToken}` : null;
    if (!voter) throw new Error("Could not record that");
    const db = createDb();
    const [article] = await db
      .select({ id: helpArticle.id })
      .from(helpArticle)
      .where(and(eq(helpArticle.id, data.articleId), eq(helpArticle.workspaceId, context.workspace.id), eq(helpArticle.status, "published")))
      .limit(1);
    if (!article) throw new Error("Article not found");

    const [prev] = await db.select({ helpful: helpArticleFeedback.helpful }).from(helpArticleFeedback).where(and(eq(helpArticleFeedback.articleId, article.id), eq(helpArticleFeedback.voter, voter))).limit(1);
    if (prev?.helpful === data.helpful) return { helpful: data.helpful, changed: false };
    if (prev) {
      await db.update(helpArticleFeedback).set({ helpful: data.helpful }).where(and(eq(helpArticleFeedback.articleId, article.id), eq(helpArticleFeedback.voter, voter)));
    } else {
      // A double click races here; the primary key keeps the second insert out.
      const inserted = await db.insert(helpArticleFeedback).values({ articleId: article.id, voter, helpful: data.helpful }).onConflictDoNothing().returning({ voter: helpArticleFeedback.voter });
      if (!inserted.length) return { helpful: data.helpful, changed: false };
    }
    const up = data.helpful ? 1 : prev ? -1 : 0;
    const down = data.helpful ? (prev ? -1 : 0) : 1;
    await db
      .update(helpArticle)
      .set({ helpfulCount: sql`max(0, ${helpArticle.helpfulCount} + ${up})`, unhelpfulCount: sql`max(0, ${helpArticle.unhelpfulCount} + ${down})` })
      .where(eq(helpArticle.id, article.id));
    return { helpful: data.helpful, changed: true };
  });

// ---------------------------------------------------------------------------
// Dashboard

export const listHelpAdmin = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    requireTeam(context.user);
    const db = createDb();
    const ws = context.workspace.id;
    const [collections, articles] = await Promise.all([
      db.select().from(helpCollection).where(eq(helpCollection.workspaceId, ws)).orderBy(asc(helpCollection.position), asc(helpCollection.id)),
      db.select().from(helpArticle).where(eq(helpArticle.workspaceId, ws)).orderBy(asc(helpArticle.position), asc(helpArticle.id)),
    ]);
    return { collections, articles };
  });

export const saveHelpArticle = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        id: z.number().int().optional(),
        title: z.string().trim().min(3).max(140),
        slug: slugField.default(""),
        excerpt: z.string().trim().max(240).default(""),
        body: z.string().max(50000).default(""),
        collectionId: z.number().int().nullable().default(null),
        publish: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const u = requireTeam(context.user);
    const db = createDb();
    const ws = context.workspace.id;

    // Article and collection ids are global. Prove both belong here first.
    const [existing] = data.id
      ? await db.select({ id: helpArticle.id, publishedAt: helpArticle.publishedAt }).from(helpArticle).where(and(eq(helpArticle.id, data.id), eq(helpArticle.workspaceId, ws))).limit(1)
      : [];
    if (data.id && !existing) throw new Error("Article not found");
    if (data.collectionId !== null) {
      const [owned] = await db.select({ id: helpCollection.id }).from(helpCollection).where(and(eq(helpCollection.id, data.collectionId), eq(helpCollection.workspaceId, ws))).limit(1);
      if (!owned) throw new Error("Collection not found");
    }

    const taken = await db
      .select({ slug: helpArticle.slug })
      .from(helpArticle)
      .where(and(eq(helpArticle.workspaceId, ws), data.id ? ne(helpArticle.id, data.id) : undefined));
    const takenSlugs = taken.map((r) => r.slug);
    // An explicit slug must be free; a derived one takes the next free number.
    if (data.slug && takenSlugs.includes(data.slug)) throw new Error(`Another article already uses /help/${data.slug}`);
    const slug = data.slug || uniqueSlug(data.title, takenSlugs);

    const values = {
      title: data.title,
      slug,
      excerpt: data.excerpt || null,
      body: data.body,
      collectionId: data.collectionId,
      status: data.publish ? ("published" as const) : ("draft" as const),
      // First publish date sticks, so edits do not look like new articles.
      publishedAt: data.publish ? (existing?.publishedAt ?? new Date()) : null,
      updatedAt: new Date(),
    };
    let id = data.id;
    if (id) {
      await db.update(helpArticle).set(values).where(and(eq(helpArticle.id, id), eq(helpArticle.workspaceId, ws)));
    } else {
      const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${helpArticle.position}), -1) + 1` }).from(helpArticle).where(eq(helpArticle.workspaceId, ws));
      [{ id }] = await db.insert(helpArticle).values({ ...values, workspaceId: ws, authorId: u.id, position: Number(n) }).returning({ id: helpArticle.id });
    }
    await refreshShell(ws);
    return { id: id!, slug };
  });

export const deleteHelpArticle = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    requireTeam(context.user);
    await createDb().delete(helpArticle).where(and(eq(helpArticle.id, data.id), eq(helpArticle.workspaceId, context.workspace.id)));
    await refreshShell(context.workspace.id);
    return { ok: true };
  });

export const saveHelpCollection = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        id: z.number().int().optional(),
        title: z.string().trim().min(2).max(80),
        description: z.string().trim().max(200).default(""),
        slug: slugField.default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    requireTeam(context.user);
    const db = createDb();
    const ws = context.workspace.id;
    if (data.id) {
      const [owned] = await db.select({ id: helpCollection.id }).from(helpCollection).where(and(eq(helpCollection.id, data.id), eq(helpCollection.workspaceId, ws))).limit(1);
      if (!owned) throw new Error("Collection not found");
    }
    const taken = (await db.select({ slug: helpCollection.slug }).from(helpCollection).where(and(eq(helpCollection.workspaceId, ws), data.id ? ne(helpCollection.id, data.id) : undefined))).map((r) => r.slug);
    if (data.slug && taken.includes(data.slug)) throw new Error(`Another collection already uses ${data.slug}`);
    const slug = data.slug || uniqueSlug(data.title, taken, "collection");
    const values = { title: data.title, description: data.description || null, slug };
    let id = data.id;
    if (id) {
      await db.update(helpCollection).set(values).where(and(eq(helpCollection.id, id), eq(helpCollection.workspaceId, ws)));
    } else {
      const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${helpCollection.position}), -1) + 1` }).from(helpCollection).where(eq(helpCollection.workspaceId, ws));
      [{ id }] = await db.insert(helpCollection).values({ ...values, workspaceId: ws, position: Number(n) }).returning({ id: helpCollection.id });
    }
    return { id: id!, slug };
  });

export const deleteHelpCollection = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    requireTeam(context.user);
    const db = createDb();
    const ws = context.workspace.id;
    // Foreign keys are not enforced on every SQLite connection, so unfile the
    // articles here rather than relying on ON DELETE SET NULL.
    await db.update(helpArticle).set({ collectionId: null }).where(and(eq(helpArticle.workspaceId, ws), eq(helpArticle.collectionId, data.id)));
    await db.delete(helpCollection).where(and(eq(helpCollection.id, data.id), eq(helpCollection.workspaceId, ws)));
    return { ok: true };
  });

// Collections in the order given. Ids from another workspace are ignored.
export const reorderHelpCollections = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ ids: z.array(z.number().int()).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    requireTeam(context.user);
    const db = createDb();
    const ws = context.workspace.id;
    const owned = new Set((await db.select({ id: helpCollection.id }).from(helpCollection).where(and(eq(helpCollection.workspaceId, ws), inArray(helpCollection.id, data.ids)))).map((r) => r.id));
    const ids = data.ids.filter((id) => owned.has(id));
    const [first, ...rest] = ids.map((id, position) => db.update(helpCollection).set({ position }).where(and(eq(helpCollection.id, id), eq(helpCollection.workspaceId, ws))));
    if (first) await db.batch([first, ...rest]);
    return { ok: true };
  });
