import { activity, changelogEntry, changelogPost, createDb, post } from "@openheard/db";
import { purgeWorkspaceCache } from "@/lib/cache";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { statusOfKind } from "@/lib/status-db";
import { requireAdmin, sessionMiddleware } from "@/lib/session";

export const listChangelog = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
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
    let id = data.id;
    const values = { workspaceId: context.workspace.id, title: data.title, body: data.body, version: data.version || null, authorId: u.id, publishedAt: data.publish ? new Date() : null };
    if (id) {
      await db.update(changelogEntry).set(values).where(and(eq(changelogEntry.id, id), eq(changelogEntry.workspaceId, context.workspace.id)));
      await db.delete(changelogPost).where(eq(changelogPost.entryId, id));
    } else {
      [{ id }] = await db.insert(changelogEntry).values(values).returning({ id: changelogEntry.id });
    }
    if (data.postIds.length) {
      await db.insert(changelogPost).values(data.postIds.map((postId) => ({ entryId: id!, postId })));
      if (data.publish) {
        // Shipping closes the loop: linked posts move to done.
        const linked = await db.select({ id: post.id, status: post.status }).from(post).where(and(eq(post.workspaceId, context.workspace.id), inArray(post.id, data.postIds)));
        const done = (await statusOfKind(db, context.workspace.id, "done"))?.key ?? "done";
        const toShip = linked.filter((p) => p.status !== done);
        if (toShip.length) {
          await db.update(post).set({ status: done, statusChangedAt: new Date() }).where(inArray(post.id, toShip.map((p) => p.id)));
          await db.insert(activity).values(toShip.map((p) => ({ postId: p.id, actorId: u.id, type: "status" as const, fromStatus: p.status, toStatus: done, note: `shipped in ${data.version || data.title}` })));
        }
      }
    }
    purgeWorkspaceCache(new URL(getRequest().url).origin);
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
