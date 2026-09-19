import { apiKey, board, createDb, membership, post, postTag, tag, workspace } from "@openheard/db";

import { purgeWorkspaceCache } from "@/lib/cache";
import { listStatuses } from "@/lib/status-db";
import { user } from "@openheard/db/schema/auth";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import { invalidate } from "@/lib/kv-cache";
import { assertNotDemo } from "@/lib/demo";
import { requireAdmin, requireUser, sessionMiddleware } from "@/lib/session";

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
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
        whoCanPost: z.enum(["anyone", "members"]).optional(),
        anonymousVoting: z.boolean().optional(),
        showRoadmap: z.boolean().optional(),
        showChangelog: z.boolean().optional(),
        website: z.string().trim().url().max(200).nullable().optional(),
        heardAboutUs: z.string().trim().max(100).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const db = createDb();
    await db.update(workspace).set(data).where(eq(workspace.id, context.workspace.id));
    void invalidate(`workspace:${context.workspace.id}`);
    purgeWorkspaceCache(new URL(getRequest().url).origin);
    return { ok: true };
  });

export const saveBoard = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(60), description: z.string().trim().max(200).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const db = createDb();
    const ws = context.workspace.id;
    if (data.id) {
      await db.update(board).set({ name: data.name, description: data.description ?? null }).where(and(eq(board.id, data.id), eq(board.workspaceId, ws)));
      void invalidate(`workspace:${ws}`);
      purgeWorkspaceCache(new URL(getRequest().url).origin);
      return { id: data.id };
    }
    const [{ n }] = await db.select({ n: count() }).from(board).where(eq(board.workspaceId, ws));
    // Board ids are global (they sit in URLs), so prefix outside the default workspace.
    let id = ws === "default" ? slug(data.name) : `${ws}-${slug(data.name)}`;
    const taken = await db.select({ id: board.id }).from(board).where(eq(board.id, id));
    if (taken.length) id = `${id}-${n + 1}`;
    await db.insert(board).values({ id, workspaceId: ws, name: data.name, description: data.description ?? null, position: n });
    void invalidate(`workspace:${ws}`);
    purgeWorkspaceCache(new URL(getRequest().url).origin);
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
    await db.delete(board).where(and(eq(board.id, data.id), eq(board.workspaceId, context.workspace.id)));
    void invalidate(`workspace:${context.workspace.id}`);
    purgeWorkspaceCache(new URL(getRequest().url).origin);
    return { ok: true };
  });

export const saveTag = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ name: z.string().trim().min(1).max(30) }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const ws = context.workspace.id;
    const id = ws === "default" ? slug(data.name) : `${ws}-${slug(data.name)}`;
    await createDb().insert(tag).values({ id, workspaceId: ws, name: data.name }).onConflictDoUpdate({ target: tag.id, set: { name: data.name } });
    void invalidate(`workspace:${ws}`);
    purgeWorkspaceCache(new URL(getRequest().url).origin);
    return { id };
  });

export const deleteTag = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    await createDb().delete(tag).where(and(eq(tag.id, data.id), eq(tag.workspaceId, context.workspace.id)));
    void invalidate(`workspace:${context.workspace.id}`);
    purgeWorkspaceCache(new URL(getRequest().url).origin);
    return { ok: true };
  });

// ---- personal ----

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ name: z.string().trim().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const u = requireUser(context.user);
    await createDb().update(user).set({ name: data.name }).where(eq(user.id, u.id));
    return { ok: true };
  });

export const getNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const u = requireUser(context.user);
    const [m] = await createDb()
      .select({ notifyNewPost: membership.notifyNewPost, notifyComment: membership.notifyComment, notifyStatus: membership.notifyStatus })
      .from(membership)
      .where(and(eq(membership.workspaceId, context.workspace.id), eq(membership.userId, u.id)));
    return m ?? { notifyNewPost: true, notifyComment: true, notifyStatus: false };
  });

export const saveNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ notifyNewPost: z.boolean(), notifyComment: z.boolean(), notifyStatus: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const u = requireUser(context.user);
    await createDb().update(membership).set(data).where(and(eq(membership.workspaceId, context.workspace.id), eq(membership.userId, u.id)));
    return { ok: true };
  });

// ---- API keys ----

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    requireAdmin(context.user);
    assertNotDemo(context.workspace);
    return createDb()
      .select({ id: apiKey.id, name: apiKey.name, prefix: apiKey.prefix, createdAt: apiKey.createdAt, lastUsedAt: apiKey.lastUsedAt, revokedAt: apiKey.revokedAt })
      .from(apiKey)
      .where(eq(apiKey.workspaceId, context.workspace.id))
      .orderBy(apiKey.createdAt);
  });

// Returns the plain key exactly once. Only the hash is kept.
export const createApiKey = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ name: z.string().trim().min(1).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const u = requireAdmin(context.user);
    assertNotDemo(context.workspace);
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const key = `oh_${secret}`;
    const prefix = key.slice(0, 11);
    await createDb().insert(apiKey).values({ id: crypto.randomUUID(), workspaceId: context.workspace.id, name: data.name, prefix, hash: await sha256(key), createdBy: u.id });
    return { key };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    assertNotDemo(context.workspace);
    await createDb().update(apiKey).set({ revokedAt: new Date() }).where(and(eq(apiKey.id, data.id), eq(apiKey.workspaceId, context.workspace.id)));
    return { ok: true };
  });

// ---- export ----

export const exportPosts = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    requireAdmin(context.user);
    assertNotDemo(context.workspace);
    const db = createDb();
    const rows = await db.query.post.findMany({
      where: eq(post.workspaceId, context.workspace.id),
      with: { author: { columns: { name: true, email: true } }, board: { columns: { name: true } }, tags: { with: { tag: true } }, comments: { with: { author: { columns: { name: true, email: true } } } } },
    });
    return rows.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      status: p.status,
      board: p.board.name,
      tags: p.tags.map((t) => t.tag.name),
      votes: p.voteCount,
      author: p.author ? { name: p.author.name, email: p.author.email } : null,
      createdAt: p.createdAt,
      comments: p.comments.filter((c) => !c.internal).map((c) => ({ body: c.body, author: c.author?.name ?? null, createdAt: c.createdAt })),
    }));
  });

// ---- import ----

const importRow = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20000).default(""),
  votes: z.number().int().min(0).default(0),
  createdAt: z.string().optional(),
  authorName: z.string().trim().max(80).optional(),
  authorEmail: z.string().trim().email().optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(30)).default([]),
  board: z.string().trim().max(60).optional(),
  status: z.string().trim().max(40).optional(),
  eta: z.string().trim().max(40).optional(),
});

// Words competitors use, mapped onto our status kinds. Anything else lands in "open".
const STATUS_WORDS: [RegExp, "open" | "review" | "planned" | "progress" | "done" | "closed"][] = [
  [/review|reviewing|pending|open|new|backlog|under consideration|gathering/i, "review"],
  [/planned|accepted|approved|scheduled/i, "planned"],
  [/progress|active|building|started|working|in development/i, "progress"],
  [/done|complete|shipped|released|live|launched/i, "done"],
  [/closed|declined|rejected|won.?t|duplicate|archived/i, "closed"],
];

// Imports posts from a CSV that has already been parsed on the client
// (the common feedback-tool export shape: title, body, status, votes, author). Authors
// become member accounts keyed by email so their name shows on the post; they
// can claim the account by signing up with that email later.
export const importPosts = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ rows: z.array(importRow).min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const me = requireAdmin(context.user);
    const db = createDb();
    const ws = context.workspace.id;
    const statuses = await listStatuses(db, ws);
    const byKind = (k: string) => statuses.find((s) => s.kind === k)?.key;
    const openKey = byKind("open") ?? "open";

    const boards = new Map((await db.select({ id: board.id, name: board.name }).from(board).where(eq(board.workspaceId, ws))).map((b) => [b.name.toLowerCase(), b.id]));
    const tags = new Map((await db.select({ id: tag.id, name: tag.name }).from(tag).where(eq(tag.workspaceId, ws))).map((t) => [t.name.toLowerCase(), t.id]));
    const users = new Map((await db.select({ id: user.id, email: user.email }).from(user)).map((u) => [u.email.toLowerCase(), u.id]));
    const [{ n: boardCount }] = await db.select({ n: count() }).from(board).where(eq(board.workspaceId, ws));
    let nextBoardPos = boardCount;
    let created = 0;

    for (const r of data.rows) {
      // Board: reuse by name, else create.
      const boardName = r.board?.trim() || "Feature requests";
      let boardId = boards.get(boardName.toLowerCase());
      if (!boardId) {
        boardId = (ws === "default" ? slug(boardName) : `${ws}-${slug(boardName)}`) || "board";
        if ([...boards.values()].includes(boardId)) boardId = `${boardId}-${nextBoardPos + 1}`;
        await db.insert(board).values({ id: boardId, workspaceId: ws, name: boardName, position: nextBoardPos++ }).onConflictDoNothing();
        boards.set(boardName.toLowerCase(), boardId);
      }
      // Author: reuse by email, else create a member account they can claim later.
      let authorId: string | null = null;
      const email = r.authorEmail?.toLowerCase();
      if (email) {
        authorId = users.get(email) ?? null;
        if (!authorId) {
          authorId = crypto.randomUUID();
          await db.insert(user).values({ id: authorId, name: r.authorName || email.split("@")[0]!, email, emailVerified: false, role: "member" }).onConflictDoNothing();
          users.set(email, authorId);
        }
      }
      // Status: match words, fall back to open.
      let statusKey = openKey;
      if (r.status) {
        const exact = statuses.find((s) => s.label.toLowerCase() === r.status!.toLowerCase());
        const kind = STATUS_WORDS.find(([re]) => re.test(r.status!))?.[1];
        statusKey = exact?.key ?? (kind ? (byKind(kind) ?? openKey) : openKey);
      }
      const createdAt = r.createdAt && !Number.isNaN(Date.parse(r.createdAt)) ? new Date(r.createdAt) : new Date();
      const [p] = await db
        .insert(post)
        .values({ workspaceId: ws, boardId, authorId, title: r.title, body: r.body, status: statusKey, voteCount: r.votes, eta: r.eta || null, createdAt, updatedAt: createdAt, statusChangedAt: createdAt })
        .returning({ id: post.id });
      for (const name of r.tags) {
        let tagId = tags.get(name.toLowerCase());
        if (!tagId) {
          tagId = ws === "default" ? slug(name) : `${ws}-${slug(name)}`;
          await db.insert(tag).values({ id: tagId, workspaceId: ws, name }).onConflictDoNothing();
          tags.set(name.toLowerCase(), tagId);
        }
        await db.insert(postTag).values({ postId: p.id, tagId }).onConflictDoNothing();
      }
      created++;
    }
    void me;
    purgeWorkspaceCache(new URL(getRequest().url).origin);
    return { created };
  });
