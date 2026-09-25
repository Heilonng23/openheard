import { activity, changelogEntry, changelogPost, createDb, post } from "@openheard/db";
import { purgeWorkspaceCache } from "@/lib/cache";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { notifyIntegrations } from "@/lib/integration-db";
import { statusOfKind } from "@/lib/status-db";
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
    let wasPublished = false;
    const values = { workspaceId: ws, title: data.title, body: data.body, version: data.version || null, authorId: u.id, publishedAt: data.publish ? new Date() : null };
    // Entry and post ids are global. A scoped UPDATE that matches nothing is
    // silent, so prove ownership of everything this touches before writing.
    if (id) {
      const [owned] = await db.select({ id: changelogEntry.id, publishedAt: changelogEntry.publishedAt }).from(changelogEntry).where(and(eq(changelogEntry.id, id), eq(changelogEntry.workspaceId, ws))).limit(1);
      if (!owned) throw new Error("Changelog entry not found");
      wasPublished = !!owned.publishedAt;
    }
    const postIds = [...new Set(data.postIds)];
    if (postIds.length) {
      const owned = await db.select({ id: post.id }).from(post).where(and(eq(post.workspaceId, ws), inArray(post.id, postIds)));
      if (owned.length !== postIds.length) throw new Error("Post not found");
    }
    if (id) {
      await db.update(changelogEntry).set(values).where(and(eq(changelogEntry.id, id), eq(changelogEntry.workspaceId, ws)));
      await db.delete(changelogPost).where(eq(changelogPost.entryId, id));
    } else {
      [{ id }] = await db.insert(changelogEntry).values(values).returning({ id: changelogEntry.id });
    }
    if (postIds.length) {
      await db.insert(changelogPost).values(postIds.map((postId) => ({ entryId: id!, postId })));
      if (data.publish) {
        // Shipping closes the loop: linked posts move to done.
        const linked = await db.select({ id: post.id, status: post.status }).from(post).where(and(eq(post.workspaceId, ws), inArray(post.id, postIds)));
        const done = (await statusOfKind(db, ws, "done"))?.key ?? "done";
        const toShip = linked.filter((p) => p.status !== done);
        if (toShip.length) {
          await db.update(post).set({ status: done, statusChangedAt: new Date() }).where(inArray(post.id, toShip.map((p) => p.id)));
          await db.insert(activity).values(toShip.map((p) => ({ postId: p.id, actorId: u.id, type: "status" as const, fromStatus: p.status, toStatus: done, note: `shipped in ${data.version || data.title}` })));
        }
      }
    }
    purgeWorkspaceCache(new URL(getRequest().url).origin);
    if (data.publish && !wasPublished) notifyIntegrations(db, ws, { type: "changelog.published", entryId: id! }, new URL(getRequest().url).origin);
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
