import { activity, changelogEntry, changelogPost, helpArticle, helpCollection, post } from "@openheard/db";
import type { Db } from "@openheard/db";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { HELP_SLUG, type HelpIcon, uniqueSlug } from "@/lib/help";
import { removeHelpArticle } from "@/lib/help-db";
import { notifyIntegrations } from "@/lib/integration-db";
import { buildChangelogEmails, buildStatusEmails, deliver, inBackground, type Outgoing } from "@/lib/notify";
import { listStatuses, statusOfKind } from "@/lib/status-db";

import { type OpCtx, OpError, listOf, refresh } from "./context";

// Help center and changelog writes.

function checkSlug(slug: string) {
  if (slug && !HELP_SLUG.test(slug)) throw new OpError(`Slug '${slug}' is not valid: use lowercase letters, numbers and dashes`);
}

export async function listHelp(ctx: OpCtx) {
  const ws = ctx.workspace.id;
  const [collections, articles] = await Promise.all([
    ctx.db.select().from(helpCollection).where(eq(helpCollection.workspaceId, ws)).orderBy(asc(helpCollection.position), asc(helpCollection.id)),
    ctx.db.select().from(helpArticle).where(eq(helpArticle.workspaceId, ws)).orderBy(asc(helpArticle.position), asc(helpArticle.id)),
  ]);
  return { collections, articles };
}

export async function helpArticleById(db: Db, workspaceId: string, id: number) {
  const [row] = await db.select().from(helpArticle).where(and(eq(helpArticle.id, id), eq(helpArticle.workspaceId, workspaceId))).limit(1);
  return row ?? null;
}

export async function saveHelpArticle(
  ctx: OpCtx,
  data: { id?: number; title: string; slug?: string; excerpt?: string; body?: string; collectionId?: number | null; publish: boolean },
) {
  const { db } = ctx;
  const ws = ctx.workspace.id;
  const title = data.title.trim();
  if (title.length < 3 || title.length > 140) throw new OpError("Title must be 3 to 140 characters");
  const wanted = (data.slug ?? "").trim().toLowerCase();
  checkSlug(wanted);
  const collectionId = data.collectionId ?? null;

  // Article and collection ids are global. Prove both belong here first.
  const existing = data.id ? await helpArticleById(db, ws, data.id) : null;
  if (data.id && !existing) throw new OpError(`Help article ${data.id} not found`, 404);
  if (collectionId !== null) {
    const [owned] = await db.select({ id: helpCollection.id }).from(helpCollection).where(and(eq(helpCollection.id, collectionId), eq(helpCollection.workspaceId, ws))).limit(1);
    if (!owned) {
      const all = await db.select({ id: helpCollection.id, title: helpCollection.title }).from(helpCollection).where(eq(helpCollection.workspaceId, ws));
      throw new OpError(`Collection ${collectionId} not found; collections are: ${listOf(all.map((c) => `${c.id} (${c.title})`))}`);
    }
  }

  const taken = (await db.select({ slug: helpArticle.slug }).from(helpArticle).where(and(eq(helpArticle.workspaceId, ws), data.id ? ne(helpArticle.id, data.id) : undefined))).map((r) => r.slug);
  // An explicit slug must be free; a derived one takes the next free number.
  if (wanted && taken.includes(wanted)) throw new OpError(`Another article already uses /help/${wanted}`);
  const slug = wanted || uniqueSlug(title, taken);

  const values = {
    title,
    slug,
    excerpt: data.excerpt?.trim() || null,
    body: (data.body ?? "").slice(0, 50000),
    collectionId,
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
    [{ id }] = await db.insert(helpArticle).values({ ...values, workspaceId: ws, authorId: ctx.actor?.id ?? null, position: Number(n) }).returning({ id: helpArticle.id });
  }
  refresh(ctx);
  return { id: id!, slug, status: values.status };
}

export async function deleteHelpArticle(ctx: OpCtx, id: number) {
  if (!(await helpArticleById(ctx.db, ctx.workspace.id, id))) throw new OpError(`Help article ${id} not found`, 404);
  await removeHelpArticle(ctx.db, ctx.workspace.id, id);
  refresh(ctx);
  return { deleted: id };
}

export async function saveHelpCollection(ctx: OpCtx, data: { id?: number; title: string; description?: string; icon?: HelpIcon | null; slug?: string }) {
  const { db } = ctx;
  const ws = ctx.workspace.id;
  const title = data.title.trim();
  if (title.length < 2 || title.length > 80) throw new OpError("Title must be 2 to 80 characters");
  const wanted = (data.slug ?? "").trim().toLowerCase();
  checkSlug(wanted);
  if (data.id) {
    const [owned] = await db.select({ id: helpCollection.id }).from(helpCollection).where(and(eq(helpCollection.id, data.id), eq(helpCollection.workspaceId, ws))).limit(1);
    if (!owned) throw new OpError(`Collection ${data.id} not found`, 404);
  }
  const taken = (await db.select({ slug: helpCollection.slug }).from(helpCollection).where(and(eq(helpCollection.workspaceId, ws), data.id ? ne(helpCollection.id, data.id) : undefined))).map((r) => r.slug);
  if (wanted && taken.includes(wanted)) throw new OpError(`Another collection already uses ${wanted}`);
  const slug = wanted || uniqueSlug(title, taken, "collection");
  const values = { title, description: data.description?.trim() || null, icon: data.icon ?? null, slug };
  let id = data.id;
  if (id) {
    await db.update(helpCollection).set(values).where(and(eq(helpCollection.id, id), eq(helpCollection.workspaceId, ws)));
  } else {
    const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${helpCollection.position}), -1) + 1` }).from(helpCollection).where(eq(helpCollection.workspaceId, ws));
    [{ id }] = await db.insert(helpCollection).values({ ...values, workspaceId: ws, position: Number(n) }).returning({ id: helpCollection.id });
  }
  refresh(ctx);
  return { id: id!, slug };
}

export async function deleteHelpCollection(ctx: OpCtx, id: number) {
  const { db } = ctx;
  const ws = ctx.workspace.id;
  // Foreign keys are not enforced on every SQLite connection, so unfile the
  // articles here rather than relying on ON DELETE SET NULL.
  await db.update(helpArticle).set({ collectionId: null }).where(and(eq(helpArticle.workspaceId, ws), eq(helpArticle.collectionId, id)));
  await db.delete(helpCollection).where(and(eq(helpCollection.id, id), eq(helpCollection.workspaceId, ws)));
  refresh(ctx);
  return { deleted: id };
}

// ---- changelog ----

export async function listChangelogAdmin(ctx: OpCtx, opts: { drafts?: boolean } = {}) {
  const entries = await ctx.db.query.changelogEntry.findMany({
    where: and(eq(changelogEntry.workspaceId, ctx.workspace.id), opts.drafts === false ? sql`${changelogEntry.publishedAt} is not null` : undefined),
    orderBy: [desc(sql`coalesce(${changelogEntry.publishedAt}, ${changelogEntry.createdAt})`)],
    with: { posts: { with: { post: { columns: { id: true, title: true, voteCount: true } } } } },
  });
  return entries.map((e) => ({ ...e, posts: e.posts.map((p) => p.post) }));
}

async function releaseAnnouncement(db: Db, id: number) {
  await db.update(changelogEntry).set({ emailedAt: null }).where(eq(changelogEntry.id, id));
}

// Saves an entry. Publishing moves its linked posts to done; the first
// publish emails subscribers and the linked posts' followers, later saves of
// a published entry stay quiet.
export async function saveChangelog(ctx: OpCtx, data: { id?: number; title: string; body?: string; version?: string | null; postIds?: number[]; publish: boolean }) {
  const { db } = ctx;
  const ws = ctx.workspace.id;
  const title = data.title.trim();
  if (title.length < 3 || title.length > 140) throw new OpError("Title must be 3 to 140 characters");
  const body = (data.body ?? "").trim();
  if (body.length > 20000) throw new OpError("Body is at most 20000 characters");
  const version = data.version?.trim() || null;
  let id = data.id;
  let wasPublished = false;
  const values = { workspaceId: ws, title, body, version, authorId: ctx.actor?.id ?? null, publishedAt: data.publish ? new Date() : null };
  // Entry and post ids are global. A scoped UPDATE that matches nothing is
  // silent, so prove ownership of everything this touches before writing.
  if (id) {
    const [owned] = await db.select({ id: changelogEntry.id, publishedAt: changelogEntry.publishedAt }).from(changelogEntry).where(and(eq(changelogEntry.id, id), eq(changelogEntry.workspaceId, ws))).limit(1);
    if (!owned) throw new OpError(`Changelog entry ${id} not found`, 404);
    wasPublished = !!owned.publishedAt;
  }
  const postIds = [...new Set(data.postIds ?? [])];
  if (postIds.length > 50) throw new OpError("Link at most 50 posts");
  if (postIds.length) {
    const owned = new Set((await db.select({ id: post.id }).from(post).where(and(eq(post.workspaceId, ws), inArray(post.id, postIds)))).map((p) => p.id));
    const missing = postIds.filter((p) => !owned.has(p));
    if (missing.length) throw new OpError(`Post ${missing.join(", ")} not found in this workspace`, 404);
  }
  let announce = false;
  if (id) {
    await db.update(changelogEntry).set(values).where(and(eq(changelogEntry.id, id), eq(changelogEntry.workspaceId, ws)));
    await db.delete(changelogPost).where(eq(changelogPost.entryId, id));
    if (data.publish) {
      // Claiming emailedAt with a conditional update means two saves at once cannot both announce.
      const claimed = await db.update(changelogEntry).set({ emailedAt: new Date() }).where(and(eq(changelogEntry.id, id), isNull(changelogEntry.emailedAt))).returning({ id: changelogEntry.id });
      announce = claimed.length > 0;
    }
  } else {
    [{ id }] = await db.insert(changelogEntry).values({ ...values, emailedAt: data.publish ? new Date() : null }).returning({ id: changelogEntry.id });
    announce = data.publish;
  }
  let shipped: { id: number; status: string }[] = [];
  let done = "done";
  if (postIds.length) {
    await db.insert(changelogPost).values(postIds.map((postId) => ({ entryId: id!, postId })));
    if (data.publish) {
      // Shipping closes the loop: linked posts move to done.
      const linked = await db.select({ id: post.id, status: post.status }).from(post).where(and(eq(post.workspaceId, ws), inArray(post.id, postIds)));
      done = (await statusOfKind(db, ws, "done"))?.key ?? "done";
      const toShip = linked.filter((p) => p.status !== done);
      if (toShip.length) {
        // Only posts this save actually moved, so a racing save does not email twice.
        const moved = await db.update(post).set({ status: done, statusChangedAt: new Date() }).where(and(inArray(post.id, toShip.map((p) => p.id)), ne(post.status, done))).returning({ id: post.id });
        const movedIds = new Set(moved.map((m) => m.id));
        shipped = toShip.filter((p) => movedIds.has(p.id));
      }
      if (shipped.length) {
        await db.insert(activity).values(shipped.map((p) => ({ postId: p.id, actorId: ctx.actor?.id ?? null, type: "status" as const, fromStatus: p.status, toStatus: done, note: `shipped in ${version || title}` })));
      }
    }
  }
  refresh(ctx, shipped.map((p) => p.id));
  if (data.publish && !wasPublished) notifyIntegrations(db, ws, { type: "changelog.published", entryId: id! }, ctx.origin);
  const actor = ctx.actor ?? { id: "", name: ctx.workspace.name, email: "" };
  if (announce || shipped.length) {
    const workspace = ctx.workspace;
    const origin = ctx.origin;
    await inBackground("changelog-email", async () => {
      const posts = postIds.length ? await db.select({ id: post.id, title: post.title }).from(post).where(inArray(post.id, postIds)) : [];
      if (announce) {
        // emailedAt is claimed before sending; if nobody got the email, give
        // the claim back so the next save of this entry tries again.
        let delivered = false;
        try {
          const out = await buildChangelogEmails({ db, workspace, origin, actor, entry: { title, version: version ?? undefined, body }, posts });
          delivered = !out.length || (await deliver(out, undefined, "changelog-email")).sent > 0;
        } finally {
          if (!delivered) await releaseAnnouncement(db, id!);
        }
        return;
      }
      // An already-announced entry gained posts: their followers still
      // hear that the post shipped, one email per post.
      const statuses = await listStatuses(db, ws);
      const label = (key: string) => {
        const s = statuses.find((x) => x.key === key);
        return { label: s?.label ?? key, color: s?.color ?? "#999999" };
      };
      const out: Outgoing[] = [];
      for (const p of shipped) {
        const postTitle = posts.find((x) => x.id === p.id)?.title ?? "";
        const change = { postId: p.id, postTitle, from: label(p.status), to: label(done), note: `Shipped in ${version || title}` };
        out.push(...(await buildStatusEmails({ db, workspace, origin, actor, change })));
      }
      await deliver(out, undefined, "changelog-email");
    });
  }
  return { id: id!, published: data.publish, shipped: shipped.map((p) => p.id), announced: announce };
}

// The fields of a saved entry, for edits that change only some of them.
export async function changelogById(ctx: OpCtx, id: number) {
  const entry = await ctx.db.query.changelogEntry.findFirst({
    where: and(eq(changelogEntry.id, id), eq(changelogEntry.workspaceId, ctx.workspace.id)),
    with: { posts: { columns: { postId: true } } },
  });
  if (!entry) throw new OpError(`Changelog entry ${id} not found`, 404);
  return { ...entry, postIds: entry.posts.map((p) => p.postId) };
}

export async function deleteChangelog(ctx: OpCtx, id: number) {
  await changelogById(ctx, id);
  await ctx.db.delete(changelogEntry).where(and(eq(changelogEntry.id, id), eq(changelogEntry.workspaceId, ctx.workspace.id)));
  refresh(ctx);
  return { deleted: id };
}
