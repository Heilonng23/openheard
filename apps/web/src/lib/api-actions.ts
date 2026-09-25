import {
  activity,
  attachment,
  board,
  changelogEntry,
  comment,
  post,
  status,
} from "@openheard/db";
import type { Db } from "@openheard/db";
import { user } from "@openheard/db/schema/auth";
import { and, desc, eq, isNotNull, like, or, sql, asc } from "drizzle-orm";
import { ApiError } from "./api-auth";
import { toAttachmentView } from "./attachments";
import { notifyIntegrations } from "./integration-db";
import { changelogById, saveChangelog } from "./ops/content";
import type { OpCtx } from "./ops/context";
import { addComment, setPostStatus } from "./ops/posts";

// Re-usable query logic for the HTTP API and MCP server.
// Does NOT import from functions/* (those depend on TanStack server fns).
// Business rules match the existing server functions exactly.

export async function queryListPosts(
  db: Db,
  workspaceId: string,
  opts: { board?: string; status?: string; q?: string; sort?: "top" | "new" | "trending"; limit?: number; offset?: number },
) {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);

  const where = and(
    eq(post.workspaceId, workspaceId),
    sql`${post.mergedIntoId} is null`,
    opts.board ? eq(post.boardId, opts.board) : undefined,
    opts.status ? eq(post.status, opts.status) : undefined,
    opts.q ? or(like(post.title, `%${opts.q}%`), like(post.body, `%${opts.q}%`)) : undefined,
  );

  const ageDays = sql`(julianday('now') - julianday(${post.createdAt} / 1000, 'unixepoch'))`;
  const trending = sql`(${post.voteCount} + 1.0) / ((${ageDays} + 2.0) * (${ageDays} + 2.0))`;
  const order =
    opts.sort === "new"
      ? [desc(post.pinned), desc(post.createdAt)]
      : opts.sort === "top"
        ? [desc(post.pinned), desc(post.voteCount), desc(post.createdAt)]
        : [desc(post.pinned), desc(trending)];

  const rows = await db.query.post.findMany({
    where,
    orderBy: order,
    limit,
    offset,
    with: {
      author: { columns: { id: true, name: true, image: true } },
      tags: { with: { tag: true } },
    },
  });

  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(post).where(where);

  return {
    posts: rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      status: r.status,
      pinned: r.pinned,
      voteCount: r.voteCount,
      commentCount: r.commentCount,
      boardId: r.boardId,
      eta: r.eta,
      createdAt: r.createdAt,
      author: r.author ? { name: r.author.name } : null,
      tags: r.tags.map((t) => t.tag.name),
    })),
    total,
    limit,
    offset,
  };
}

// `origin` makes attachment urls absolute; without it they are paths.
export async function queryGetPost(db: Db, workspaceId: string, postId: number, origin = "") {
  const images = { columns: { id: true, contentType: true, width: true, height: true } as const, orderBy: [asc(attachment.createdAt)] };
  const p = await db.query.post.findFirst({
    where: and(eq(post.id, postId), eq(post.workspaceId, workspaceId)),
    with: {
      board: { columns: { id: true, name: true } },
      author: { columns: { id: true, name: true, image: true } },
      tags: { with: { tag: true } },
      comments: {
        where: eq(comment.internal, false),
        with: { author: { columns: { id: true, name: true } }, attachments: images },
        orderBy: [desc(comment.createdAt)],
      },
      activity: {
        with: { actor: { columns: { id: true, name: true } } },
        orderBy: [desc(activity.createdAt)],
      },
      attachments: images,
    },
  });
  if (!p) throw new ApiError(404, "Post not found");
  return {
    id: p.id,
    title: p.title,
    body: p.body,
    status: p.status,
    pinned: p.pinned,
    voteCount: p.voteCount,
    commentCount: p.commentCount,
    boardId: p.boardId,
    board: p.board,
    eta: p.eta,
    createdAt: p.createdAt,
    author: p.author ? { name: p.author.name } : null,
    tags: p.tags.map((t) => t.tag.name),
    attachments: p.attachments.map((a) => toAttachmentView(a, origin)),
    comments: p.comments.map((c) => ({
      id: c.id,
      body: c.body,
      attachments: c.attachments.map((a) => toAttachmentView(a, origin)),
      author: c.author ? { name: c.author.name } : null,
      createdAt: c.createdAt,
    })),
    activity: p.activity.map((a) => ({
      type: a.type,
      from: a.fromStatus,
      to: a.toStatus,
      note: a.note,
      actor: a.actor ? { name: a.actor.name } : null,
      createdAt: a.createdAt,
    })),
  };
}

export async function mutateCreatePost(
  db: Db,
  workspaceId: string,
  data: { title: string; body?: string; boardId: string; authorEmail?: string },
  origin?: string,
) {
  if (!data.title || data.title.trim().length < 4) throw new ApiError(422, "Title must be at least 4 characters");
  if (data.title.length > 140) throw new ApiError(422, "Title must be at most 140 characters");

  const [b] = await db
    .select({ id: board.id })
    .from(board)
    .where(and(eq(board.id, data.boardId), eq(board.workspaceId, workspaceId)))
    .limit(1);
  if (!b) throw new ApiError(422, "Board not found");

  let authorId: string | null = null;
  if (data.authorEmail) {
    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, data.authorEmail.toLowerCase())).limit(1);
    if (u) authorId = u.id;
  }

  const [created] = await db
    .insert(post)
    .values({
      workspaceId,
      boardId: data.boardId,
      authorId,
      title: data.title.trim(),
      body: (data.body ?? "").slice(0, 5000),
      voteCount: 0,
    })
    .returning({ id: post.id });

  notifyIntegrations(db, workspaceId, { type: "post.created", postId: created.id }, origin);
  return { id: created.id };
}

// Status changes and comments run the dashboard's own code, emails included.
export async function mutateSetStatus(ctx: OpCtx, postId: number, statusKey: string, note?: string) {
  const r = await setPostStatus(ctx, postId, statusKey, note);
  return { ok: true, status: r.status };
}

export async function mutateAddComment(ctx: OpCtx, postId: number, body: string) {
  if (!body || body.trim().length < 1) throw new ApiError(422, "Comment body is required");
  return addComment(ctx, { postId, body, internal: false });
}

export async function queryStatuses(db: Db, workspaceId: string) {
  return db
    .select({
      key: status.key,
      label: status.label,
      color: status.color,
      kind: status.kind,
      onRoadmap: status.onRoadmap,
    })
    .from(status)
    .where(eq(status.workspaceId, workspaceId))
    .orderBy(asc(status.position));
}

export async function queryBoards(db: Db, workspaceId: string) {
  return db
    .select({
      id: board.id,
      name: board.name,
      description: board.description,
    })
    .from(board)
    .where(eq(board.workspaceId, workspaceId))
    .orderBy(asc(board.position));
}

export async function queryChangelog(db: Db, workspaceId: string) {
  const entries = await db.query.changelogEntry.findMany({
    where: and(eq(changelogEntry.workspaceId, workspaceId), isNotNull(changelogEntry.publishedAt)),
    orderBy: [desc(sql`coalesce(${changelogEntry.publishedAt}, ${changelogEntry.createdAt})`)],
    with: { posts: { with: { post: { columns: { id: true, title: true, voteCount: true } } } } },
  });
  return entries.map((e) => ({
    id: e.id,
    title: e.title,
    body: e.body,
    version: e.version,
    publishedAt: e.publishedAt,
    createdAt: e.createdAt,
    posts: e.posts.map((p) => p.post),
  }));
}

export async function mutateDraftChangelog(ctx: OpCtx, data: { title: string; body?: string; version?: string; postIds?: number[] }) {
  const { id } = await saveChangelog(ctx, { ...data, publish: false });
  return { id };
}

// Publishing an entry that is already out changes nothing.
export async function mutatePublishChangelog(ctx: OpCtx, entryId: number) {
  const entry = await changelogById(ctx, entryId);
  if (entry.publishedAt) return { ok: true, alreadyPublished: true, shipped: [] as number[] };
  const r = await saveChangelog(ctx, { id: entry.id, title: entry.title, body: entry.body, version: entry.version, postIds: entry.postIds, publish: true });
  return { ok: true, alreadyPublished: false, shipped: r.shipped };
}
