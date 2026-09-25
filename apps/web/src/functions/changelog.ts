import { changelogEntry, createDb } from "@openheard/db";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import * as content from "@/lib/ops/content";
import { adminOps } from "@/lib/ops/session";
import { sessionMiddleware, widgetSessionMiddleware } from "@/lib/session";

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
    const { id } = await content.saveChangelog(adminOps(context), data);
    return { id };
  });

export const deleteChangelog = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    await content.deleteChangelog(adminOps(context), data.id);
    return { ok: true };
  });
