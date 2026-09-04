import { board, createDb, post, tag, workspace } from "@openheard/db";
import { createServerFn } from "@tanstack/react-start";
import { count, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAdmin, sessionMiddleware } from "@/lib/session";

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "x";

export const saveWorkspace = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(60),
        tagline: z.string().trim().max(200),
        theme: z.enum(["dark", "light"]),
        poweredBy: z.boolean(),
        requireApproval: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const db = createDb();
    await db.insert(workspace).values({ id: "default", ...data }).onConflictDoUpdate({ target: workspace.id, set: data });
    return { ok: true };
  });

export const saveBoard = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(60), description: z.string().trim().max(200).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const db = createDb();
    if (data.id) {
      await db.update(board).set({ name: data.name, description: data.description ?? null }).where(eq(board.id, data.id));
      return { id: data.id };
    }
    const [{ n }] = await db.select({ n: count() }).from(board);
    let id = slug(data.name);
    const taken = await db.select({ id: board.id }).from(board).where(eq(board.id, id));
    if (taken.length) id = `${id}-${n + 1}`;
    await db.insert(board).values({ id, name: data.name, description: data.description ?? null, position: n });
    return { id };
  });

export const deleteBoard = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const db = createDb();
    const [{ n }] = await db.select({ n: count() }).from(post).where(eq(post.boardId, data.id));
    if (n > 0) throw new Error(`This board has ${n} posts. Move or delete them first.`);
    await db.delete(board).where(eq(board.id, data.id));
    return { ok: true };
  });

export const saveTag = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ name: z.string().trim().min(1).max(30) }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const id = slug(data.name);
    await createDb().insert(tag).values({ id, name: data.name }).onConflictDoUpdate({ target: tag.id, set: { name: data.name } });
    return { id };
  });

export const deleteTag = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    await createDb().delete(tag).where(eq(tag.id, data.id));
    return { ok: true };
  });
