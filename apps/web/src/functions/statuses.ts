import { STATUS_KINDS } from "@openheard/db/schema/feedback";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { invalidate } from "@/lib/kv-cache";
import { requireAdmin, sessionMiddleware } from "@/lib/session";
import { listStatuses } from "@/lib/status-db";
import { createDb, post, status } from "@openheard/db";
import { and, eq, sql } from "drizzle-orm";

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

export const saveStatus = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        key: z.string().optional(),
        label: z.string().trim().min(1).max(30),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        kind: z.enum(STATUS_KINDS),
        onRoadmap: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const db = createDb();
    const ws = context.workspace.id;
    if (data.key) {
      await db.update(status).set({ label: data.label, color: data.color, kind: data.kind, onRoadmap: data.onRoadmap }).where(and(eq(status.workspaceId, ws), eq(status.key, data.key)));
      void invalidate(`workspace:${ws}`);
      return { key: data.key };
    }
    const existing = await listStatuses(db, ws);
    let key = slug(data.label) || "status";
    if (existing.some((s) => s.key === key)) key = `${key}-${existing.length + 1}`;
    await db.insert(status).values({ workspaceId: ws, key, label: data.label, color: data.color, kind: data.kind, onRoadmap: data.onRoadmap, position: existing.length });
    void invalidate(`workspace:${ws}`);
    return { key };
  });

export const deleteStatus = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ key: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const db = createDb();
    const ws = context.workspace.id;
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(post).where(and(eq(post.workspaceId, ws), eq(post.status, data.key)));
    if (n > 0) throw new Error(`${n} ${n === 1 ? "post uses" : "posts use"} this status. Move them first.`);
    const all = await listStatuses(db, ws);
    const target = all.find((s) => s.key === data.key);
    if (!target) throw new Error("Unknown status");
    if ((target.kind === "open" || target.kind === "closed") && all.filter((s) => s.kind === target.kind).length === 1) throw new Error(`You need at least one "${target.kind}" status`);
    await db.delete(status).where(and(eq(status.workspaceId, ws), eq(status.key, data.key)));
    void invalidate(`workspace:${ws}`);
    return { ok: true };
  });

export const reorderStatuses = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ keys: z.array(z.string()).max(30) }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const db = createDb();
    const ws = context.workspace.id;
    for (const [i, key] of data.keys.entries()) {
      await db.update(status).set({ position: i }).where(and(eq(status.workspaceId, ws), eq(status.key, key)));
    }
    void invalidate(`workspace:${ws}`);
    return { ok: true };
  });
