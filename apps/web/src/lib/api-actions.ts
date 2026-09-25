import {
  activity,
  attachment,
  board,
  changelogEntry,
  changelogPost,
  comment,
  post,
  status,
} from "@openheard/db";
import type { Db } from "@openheard/db";
import { user } from "@openheard/db/schema/auth";
import { and, desc, eq, inArray, isNotNull, like, or, sql, asc } from "drizzle-orm";
import { ApiError } from "./api-auth";
import { toAttachmentView } from "./attachments";
import { notifyIntegrations } from "./integration-db";

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

  notifyIntegrations(db, workspaceId, { type: "post.created", postId: created.id });
  return { id: created.id };
}

export async function mutateSetStatus(
  db: Db,
  workspaceId: string,
  postId: number,
  statusKey: string,
) {
  const [p] = await db
    .select({ id: post.id, status: post.status })
    .from(post)
    .where(and(eq(post.id, postId), eq(post.workspaceId, workspaceId)))
    .limit(1);
  if (!p) throw new ApiError(404, "Post not found");

  const [s] = await db
    .select({ key: status.key })
    .from(status)
    .where(and(eq(status.workspaceId, workspaceId), eq(status.key, statusKey)))
    .limit(1);

  if (!s) {
    const [byLabel] = await db
      .select({ key: status.key })
      .from(status)
      .where(and(eq(status.workspaceId, workspaceId), sql`lower(${status.label}) = lower(${statusKey})`))
      .limit(1);
    if (!byLabel) throw new ApiError(422, "Unknown status");
    statusKey = byLabel.key;
  }

  if (p.status === statusKey) return { ok: true, status: statusKey };

  await db.update(post).set({ status: statusKey, statusChangedAt: new Date() }).where(eq(post.id, postId));
  await db.insert(activity).values({ postId, actorId: null, type: "status", fromStatus: p.status, toStatus: statusKey });
  notifyIntegrations(db, workspaceId, { type: "post.status_changed", postId, fromStatus: p.status });
  return { ok: true, status: statusKey };
}

export async function mutateAddComment(
  db: Db,
  workspaceId: string,
  postId: number,
  body: string,
) {
  if (!body || body.trim().length < 1) throw new ApiError(422, "Comment body is required");
  if (body.length > 5000) throw new ApiError(422, "Comment too long (max 5000 characters)");

  const [p] = await db
    .select({ id: post.id })
    .from(post)
    .where(and(eq(post.id, postId), eq(post.workspaceId, workspaceId)))
    .limit(1);
  if (!p) throw new ApiError(404, "Post not found");

  const [c] = await db
    .insert(comment)
    .values({ postId, authorId: null, body: body.trim(), internal: false })
    .returning({ id: comment.id });
  await db.update(post).set({ commentCount: sql`${post.commentCount} + 1` }).where(eq(post.id, postId));
  notifyIntegrations(db, workspaceId, { type: "comment.created", commentId: c.id });
  return { id: c.id };
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

export async function mutateDraftChangelog(
  db: Db,
  workspaceId: string,
  data: { title: string; body?: string; version?: string; postIds?: number[] },
) {
  if (!data.title || data.title.trim().length < 3) throw new ApiError(422, "Title must be at least 3 characters");
  if (data.title.length > 140) throw new ApiError(422, "Title must be at most 140 characters");

  const [entry] = await db
    .insert(changelogEntry)
    .values({
      workspaceId,
      title: data.title.trim(),
      body: (data.body ?? "").slice(0, 20000),
      version: data.version || null,
      authorId: null,
      publishedAt: null,
    })
    .returning({ id: changelogEntry.id });

  if (data.postIds?.length) {
    const valid = await db
      .select({ id: post.id })
      .from(post)
      .where(and(eq(post.workspaceId, workspaceId), inArray(post.id, data.postIds)));
    const validIds = valid.map((v) => v.id);
    if (validIds.length) {
      await db.insert(changelogPost).values(validIds.map((postId) => ({ entryId: entry.id, postId })));
    }
  }

  return { id: entry.id };
}

export async function mutatePublishChangelog(db: Db, workspaceId: string, entryId: number) {
  const [entry] = await db
    .select({ id: changelogEntry.id, publishedAt: changelogEntry.publishedAt })
    .from(changelogEntry)
    .where(and(eq(changelogEntry.id, entryId), eq(changelogEntry.workspaceId, workspaceId)))
    .limit(1);
  if (!entry) throw new ApiError(404, "Changelog entry not found");
  if (entry.publishedAt) throw new ApiError(422, "Already published");

  await db
    .update(changelogEntry)
    .set({ publishedAt: new Date() })
    .where(eq(changelogEntry.id, entryId));

  const linked = await db
    .select({ postId: changelogPost.postId })
    .from(changelogPost)
    .where(eq(changelogPost.entryId, entryId));

  if (linked.length) {
    const postIds = linked.map((l) => l.postId);
    const [doneStatus] = await db
      .select({ key: status.key })
      .from(status)
      .where(and(eq(status.workspaceId, workspaceId), eq(status.kind, "done")))
      .orderBy(asc(status.position))
      .limit(1);
    if (doneStatus) {
      const posts = await db
        .select({ id: post.id, status: post.status })
        .from(post)
        .where(and(eq(post.workspaceId, workspaceId), inArray(post.id, postIds)));
      const toShip = posts.filter((p) => p.status !== doneStatus.key);
      if (toShip.length) {
        await db
          .update(post)
          .set({ status: doneStatus.key, statusChangedAt: new Date() })
          .where(inArray(post.id, toShip.map((p) => p.id)));
        await db.insert(activity).values(
          toShip.map((p) => ({
            postId: p.id,
            actorId: null,
            type: "status" as const,
            fromStatus: p.status,
            toStatus: doneStatus.key,
            note: "shipped via changelog",
          })),
        );
      }
    }
  }

  notifyIntegrations(db, workspaceId, { type: "changelog.published", entryId });
  return { ok: true };
}
