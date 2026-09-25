import { createDb, helpArticle, helpCollection } from "@openheard/db";
import { env } from "@openheard/env/server";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { HELP_ICONS, HELP_SLUG, networkOf } from "@/lib/help";
import { helpArticleBySlug, helpCenterIndex, helpCollectionBySlug, helpNav, recordHelpVote, searchHelpArticles } from "@/lib/help-db";
import { rateLimit } from "@/lib/rate-limit";
import * as content from "@/lib/ops/content";
import { adminOps } from "@/lib/ops/session";
import { requireAdmin, sessionMiddleware, type SessionUser } from "@/lib/session";

// Admins write the help center, like the changelog: the editor lives in the
// dashboard, which only admins can open. Everyone else reads it.
const canEdit = (user: SessionUser | null) => user?.role === "admin";

function clientIp(): string {
  const request = getRequest();
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// Anonymous readers answer as their network, keyed with the auth secret so the
// table never holds an address. A browser token or cookie would be free to
// throw away and mint again for every request; an address is not.
async function anonymousVoter(): Promise<string> {
  const secret = (env as unknown as { BETTER_AUTH_SECRET?: string }).BETTER_AUTH_SECRET ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`help-vote:${networkOf(clientIp())}`));
  return `n:${Array.from(new Uint8Array(mac).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}


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
    const [collection, nav] = await Promise.all([helpCollectionBySlug(db, context.workspace.id, data.slug), helpNav(db, context.workspace.id)]);
    if (!collection) return null;
    return { collection, nav };
  });

export const getHelpArticle = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ slug: z.string().max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = createDb();
    const [article, nav] = await Promise.all([helpArticleBySlug(db, context.workspace.id, data.slug, { drafts: canEdit(context.user) }), helpNav(db, context.workspace.id)]);
    // Null rather than a throw, so the route can answer with a real 404.
    if (!article) return null;
    return { article, nav };
  });

export const searchHelp = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ q: z.string().trim().min(1).max(120), limit: z.number().int().min(1).max(25).optional(), suggest: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    // Every search scans the workspace's article bodies. Typing is debounced
    // on both callers, so a reader never comes near this.
    const rl = await rateLimit(`help-search:${clientIp()}`, { window: 60, max: 60 });
    if (!rl.allowed) throw new Error("Too many searches. Try again in a minute.");
    // Suggestions under the new-post title want a real match, not any article
    // that mentions one of the words somewhere in its body.
    return searchHelpArticles(createDb(), context.workspace.id, data.q, { limit: data.limit ?? (data.suggest ? 3 : 8), minScore: data.suggest ? 2 : 1 });
  });

// "Was this helpful?" One answer per reader per article: signed-in readers by
// account, everyone else by network. Answering again changes the answer
// rather than adding one.
export const voteHelpArticle = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ articleId: z.number().int(), helpful: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    // Counts are what the team reads to decide what to rewrite, so a limiter
    // outage refuses answers rather than letting them through unmetered.
    const rl = await rateLimit(`help-vote:${networkOf(clientIp())}`, { window: 60, max: 20, failClosed: true });
    if (!rl.allowed) throw new Error("Too many answers. Try again in a minute.");

    const voter = context.user ? `u:${context.user.id}` : await anonymousVoter();
    const db = createDb();
    const [article] = await db
      .select({ id: helpArticle.id })
      .from(helpArticle)
      .where(and(eq(helpArticle.id, data.articleId), eq(helpArticle.workspaceId, context.workspace.id), eq(helpArticle.status, "published")))
      .limit(1);
    if (!article) throw new Error("Article not found");
    await recordHelpVote(db, article.id, voter, data.helpful);
    return { helpful: data.helpful };
  });

// ---------------------------------------------------------------------------
// Dashboard

export const listHelpAdmin = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => content.listHelp(adminOps(context)));

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
    const { id, slug } = await content.saveHelpArticle(adminOps(context), data);
    return { id, slug };
  });

export const deleteHelpArticle = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    await content.deleteHelpArticle(adminOps(context), data.id);
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
        icon: z.enum(HELP_ICONS).nullable().default(null),
        slug: slugField.default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => content.saveHelpCollection(adminOps(context), data));

export const deleteHelpCollection = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    await content.deleteHelpCollection(adminOps(context), data.id);
    return { ok: true };
  });

// Collections in the order given. Ids from another workspace are ignored.
export const reorderHelpCollections = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ ids: z.array(z.number().int()).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const db = createDb();
    const ws = context.workspace.id;
    const owned = new Set((await db.select({ id: helpCollection.id }).from(helpCollection).where(and(eq(helpCollection.workspaceId, ws), inArray(helpCollection.id, data.ids)))).map((r) => r.id));
    const ids = data.ids.filter((id) => owned.has(id));
    const [first, ...rest] = ids.map((id, position) => db.update(helpCollection).set({ position }).where(and(eq(helpCollection.id, id), eq(helpCollection.workspaceId, ws))));
    if (first) await db.batch([first, ...rest]);
    return { ok: true };
  });
