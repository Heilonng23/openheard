import { board, post, status, tag } from "@openheard/db";
import type { StatusKind } from "@openheard/db/schema/feedback";
import { and, asc, count, eq, sql } from "drizzle-orm";

import { listStatuses } from "@/lib/status-db";

import { type OpCtx, OpError, listOf, refresh } from "./context";
import { resolveBoard } from "./posts";

// Boards, tags and statuses: the shape of a workspace.

const slug = (s: string, max = 40) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max) || "x";

// Board and tag ids are a single global namespace: "Demo private" in default
// and "Private" in demo both slugify to `demo-private`. Prefixes narrow the
// collisions, they do not remove them, so every write proves ownership first.
async function assertIdFree(ctx: OpCtx, table: typeof board | typeof tag, id: string) {
  const [row] = await ctx.db.select({ workspaceId: table.workspaceId }).from(table).where(eq(table.id, id)).limit(1);
  if (row && row.workspaceId !== ctx.workspace.id) throw new OpError("That name is already in use");
  return !!row;
}

// Board ids sit in URLs, so they are prefixed outside the default workspace.
const scopedId = (ctx: OpCtx, name: string) => (ctx.workspace.id === "default" ? slug(name) : `${ctx.workspace.id}-${slug(name)}`);

export async function listBoards(ctx: OpCtx) {
  return ctx.db
    .select({ id: board.id, name: board.name, description: board.description, posts: count(post.id) })
    .from(board)
    .leftJoin(post, eq(post.boardId, board.id))
    .where(eq(board.workspaceId, ctx.workspace.id))
    .groupBy(board.id)
    .orderBy(asc(board.position));
}

export async function saveBoard(ctx: OpCtx, data: { id?: string; name: string; description?: string | null }) {
  const { db } = ctx;
  const ws = ctx.workspace.id;
  const name = data.name.trim();
  if (!name || name.length > 60) throw new OpError("Board name must be 1 to 60 characters");
  if (data.id) {
    const b = await resolveBoard(ctx, data.id);
    await db.update(board).set({ name, description: data.description?.trim() || null }).where(and(eq(board.id, b.id), eq(board.workspaceId, ws)));
    refresh(ctx);
    return { id: b.id, created: false };
  }
  const [{ n }] = await db.select({ n: count() }).from(board).where(eq(board.workspaceId, ws));
  let id = scopedId(ctx, name);
  if (await assertIdFree(ctx, board, id)) id = `${id}-${n + 1}`;
  await assertIdFree(ctx, board, id);
  await db.insert(board).values({ id, workspaceId: ws, name, description: data.description?.trim() || null, position: n });
  refresh(ctx);
  return { id, created: true };
}

export async function deleteBoard(ctx: OpCtx, idOrName: string) {
  const b = await resolveBoard(ctx, idOrName);
  const [{ n }] = await ctx.db.select({ n: count() }).from(post).where(and(eq(post.boardId, b.id), eq(post.workspaceId, ctx.workspace.id)));
  if (n > 0) throw new OpError(`This board has ${n} posts. Move or delete them first.`);
  await ctx.db.delete(board).where(and(eq(board.id, b.id), eq(board.workspaceId, ctx.workspace.id)));
  refresh(ctx);
  return { deleted: b.id };
}

export async function listTags(ctx: OpCtx) {
  return ctx.db.select({ id: tag.id, name: tag.name }).from(tag).where(eq(tag.workspaceId, ctx.workspace.id)).orderBy(asc(tag.name));
}

// Creating a tag that exists (same name) just returns it.
export async function saveTag(ctx: OpCtx, name: string) {
  const clean = name.trim();
  if (!clean || clean.length > 30) throw new OpError("Tag name must be 1 to 30 characters");
  const id = scopedId(ctx, clean);
  await assertIdFree(ctx, tag, id);
  await ctx.db
    .insert(tag)
    .values({ id, workspaceId: ctx.workspace.id, name: clean })
    .onConflictDoUpdate({ target: tag.id, set: { name: clean }, setWhere: eq(tag.workspaceId, ctx.workspace.id) });
  refresh(ctx);
  return { id, name: clean };
}

async function ownTag(ctx: OpCtx, idOrName: string) {
  const all = await listTags(ctx);
  const hit = all.find((t) => t.id === idOrName) ?? all.find((t) => t.name.toLowerCase() === idOrName.trim().toLowerCase());
  if (!hit) throw new OpError(`Tag '${idOrName}' not found; tags are: ${listOf(all.map((t) => t.name))}`, 404);
  return hit;
}

export async function renameTag(ctx: OpCtx, idOrName: string, name: string) {
  const t = await ownTag(ctx, idOrName);
  const clean = name.trim();
  if (!clean || clean.length > 30) throw new OpError("Tag name must be 1 to 30 characters");
  await ctx.db.update(tag).set({ name: clean }).where(and(eq(tag.id, t.id), eq(tag.workspaceId, ctx.workspace.id)));
  refresh(ctx);
  return { id: t.id, name: clean };
}

export async function deleteTag(ctx: OpCtx, idOrName: string) {
  const t = await ownTag(ctx, idOrName);
  await ctx.db.delete(tag).where(and(eq(tag.id, t.id), eq(tag.workspaceId, ctx.workspace.id)));
  refresh(ctx);
  return { deleted: t.id };
}

export async function listStatusesWithCounts(ctx: OpCtx) {
  const [all, counts] = await Promise.all([
    listStatuses(ctx.db, ctx.workspace.id),
    ctx.db.select({ status: post.status, n: count() }).from(post).where(and(eq(post.workspaceId, ctx.workspace.id), sql`${post.mergedIntoId} is null`)).groupBy(post.status),
  ]);
  const by = new Map(counts.map((c) => [c.status, c.n]));
  return all.map((s) => ({ key: s.key, label: s.label, color: s.color, kind: s.kind, onRoadmap: s.onRoadmap, position: s.position, posts: by.get(s.key) ?? 0 }));
}

export async function saveStatus(ctx: OpCtx, data: { key?: string; label: string; color: string; kind: StatusKind; onRoadmap: boolean }) {
  const { db } = ctx;
  const ws = ctx.workspace.id;
  const label = data.label.trim();
  if (!label || label.length > 30) throw new OpError("Status label must be 1 to 30 characters");
  if (!/^#[0-9a-fA-F]{6}$/.test(data.color)) throw new OpError("Colour must be a hex like #6e8bff");
  const existing = await listStatuses(db, ws);
  if (data.key) {
    if (!existing.some((s) => s.key === data.key)) throw new OpError(`Status '${data.key}' not found; statuses are: ${listOf(existing.map((s) => s.key))}`, 404);
    await db.update(status).set({ label, color: data.color, kind: data.kind, onRoadmap: data.onRoadmap }).where(and(eq(status.workspaceId, ws), eq(status.key, data.key)));
    refresh(ctx);
    return { key: data.key, created: false };
  }
  let key = slug(label, 24) || "status";
  if (existing.some((s) => s.key === key)) key = `${key}-${existing.length + 1}`;
  await db.insert(status).values({ workspaceId: ws, key, label, color: data.color, kind: data.kind, onRoadmap: data.onRoadmap, position: existing.length });
  refresh(ctx);
  return { key, created: true };
}

export async function deleteStatus(ctx: OpCtx, key: string) {
  const { db } = ctx;
  const ws = ctx.workspace.id;
  const all = await listStatuses(db, ws);
  const target = all.find((s) => s.key === key);
  if (!target) throw new OpError(`Status '${key}' not found; statuses are: ${listOf(all.map((s) => s.key))}`, 404);
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(post).where(and(eq(post.workspaceId, ws), eq(post.status, key)));
  if (n > 0) throw new OpError(`${n} ${n === 1 ? "post uses" : "posts use"} this status. Move them first.`);
  if ((target.kind === "open" || target.kind === "closed") && all.filter((s) => s.kind === target.kind).length === 1) throw new OpError(`You need at least one "${target.kind}" status`);
  await db.delete(status).where(and(eq(status.workspaceId, ws), eq(status.key, key)));
  refresh(ctx);
  return { deleted: key };
}

// Statuses in the order given; keys left out keep their place after them.
export async function reorderStatuses(ctx: OpCtx, keys: string[]) {
  const ws = ctx.workspace.id;
  const all = await listStatuses(ctx.db, ws);
  const unknown = keys.filter((k) => !all.some((s) => s.key === k));
  if (unknown.length) throw new OpError(`Status '${unknown[0]}' not found; statuses are: ${listOf(all.map((s) => s.key))}`);
  const order = [...new Set(keys), ...all.map((s) => s.key).filter((k) => !keys.includes(k))];
  for (const [i, key] of order.entries()) {
    await ctx.db.update(status).set({ position: i }).where(and(eq(status.workspaceId, ws), eq(status.key, key)));
  }
  refresh(ctx);
  return { order };
}
