import { activity, changelogEntry, changelogPost, createDb, post } from "@openheard/db";
import { purgeWorkspaceCache } from "@/lib/cache";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { buildChangelogEmails, buildStatusEmails, deliver, inBackground, type Outgoing } from "@/lib/notify";
import { listStatuses, statusOfKind } from "@/lib/status-db";
import { requireAdmin, sessionMiddleware, widgetSessionMiddleware } from "@/lib/session";

export const listChangelog = createServerFn({ method: "GET" })
  .middleware([widgetSessionMiddleware])
  .handler(async ({ context }) => {
    const db = createDb();
    const admin = context.user?.role === "admin";
    const entries = await db.query.changelogEntry.findMany({
      where: and(eq(changelogEntry.workspaceId, context.workspace.id), admin ? undefined : isNotNull(changelogEntry.publishedAt)),
      orderBy: [desc(sql`coalesce(${changelogEntry.publishedAt}, ${changelogEntry.createdAt})`)],
      with: { posts: { with: { post: { columns: { id: true, title: true, voteCount: true } } } } },
    });
    return entries.map((e) => ({ ...e, posts: e.posts.map((p) => p.post) }));
  });

async function releaseAnnouncement(db: ReturnType<typeof createDb>, id: number) {
  await db.update(changelogEntry).set({ emailedAt: null }).where(eq(changelogEntry.id, id));
}

export const saveChangelog = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        id: z.number().int().optional(),
        title: z.string().trim().min(3).max(140),
        body: z.string().trim().max(20000).default(""),
        version: z.string().trim().max(40).optional(),
        postIds: z.array(z.number().int()).max(50).default([]),
        publish: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const u = requireAdmin(context.user);
    const db = createDb();
    const ws = context.workspace.id;
    let id = data.id;
    const values = { workspaceId: ws, title: data.title, body: data.body, version: data.version || null, authorId: u.id, publishedAt: data.publish ? new Date() : null };
    // Entry and post ids are global. A scoped UPDATE that matches nothing is
    // silent, so prove ownership of everything this touches before writing.
    if (id) {
      const [owned] = await db.select({ id: changelogEntry.id }).from(changelogEntry).where(and(eq(changelogEntry.id, id), eq(changelogEntry.workspaceId, ws))).limit(1);
      if (!owned) throw new Error("Changelog entry not found");
    }
    const postIds = [...new Set(data.postIds)];
    if (postIds.length) {
      const owned = await db.select({ id: post.id }).from(post).where(and(eq(post.workspaceId, ws), inArray(post.id, postIds)));
      if (owned.length !== postIds.length) throw new Error("Post not found");
    }
    // The first publish emails subscribers and the linked posts' followers;
    // later edits of a published entry stay quiet. Claiming emailedAt with a
    // conditional update means two saves at once cannot both announce.
    let announce = false;
    if (id) {
      await db.update(changelogEntry).set(values).where(and(eq(changelogEntry.id, id), eq(changelogEntry.workspaceId, ws)));
      await db.delete(changelogPost).where(eq(changelogPost.entryId, id));
      if (data.publish) {
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
          await db.insert(activity).values(shipped.map((p) => ({ postId: p.id, actorId: u.id, type: "status" as const, fromStatus: p.status, toStatus: done, note: `shipped in ${data.version || data.title}` })));
        }
      }
    }
    const origin = new URL(getRequest().url).origin;
    purgeWorkspaceCache(origin);
    if (announce || shipped.length) {
      const workspace = context.workspace;
      await inBackground("changelog-email", async () => {
        const posts = postIds.length ? await db.select({ id: post.id, title: post.title }).from(post).where(inArray(post.id, postIds)) : [];
        if (announce) {
          // emailedAt is claimed before sending; if nobody got the email, give
          // the claim back so the next save of this entry tries again.
          let delivered = false;
          try {
            const out = await buildChangelogEmails({ db, workspace, origin, actor: u, entry: { title: data.title, version: data.version, body: data.body }, posts });
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
          const change = { postId: p.id, postTitle, from: label(p.status), to: label(done), note: `Shipped in ${data.version || data.title}` };
          out.push(...(await buildStatusEmails({ db, workspace, origin, actor: u, change })));
        }
        await deliver(out, undefined, "changelog-email");
      });
    }
    return { id };
  });

export const deleteChangelog = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    await createDb().delete(changelogEntry).where(and(eq(changelogEntry.id, data.id), eq(changelogEntry.workspaceId, context.workspace.id)));
    purgeWorkspaceCache(new URL(getRequest().url).origin);
    return { ok: true };
  });
