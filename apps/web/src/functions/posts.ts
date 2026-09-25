import { activity, anonymousVote, attachment, board, comment, commentReaction, createDb, post, postTag, status, tag, vote } from "@openheard/db";

import { purgeWorkspaceCache } from "@/lib/cache";
import { listStatuses, statusOfKind } from "@/lib/status-db";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod";

import { AttachmentGoneError, claimQuery, reserveAttachments } from "@/lib/attachment-db";
import { MAX_IMAGES, toAttachmentView } from "@/lib/attachments";
import { notifyIntegrations } from "@/lib/integration-db";
import { invalidate } from "@/lib/kv-cache";
import { addComment as addCommentOp, mergePosts as mergePostsOp, setPinned, setPostEta, setPostStatus, setPostTags, setVote, similarPosts } from "@/lib/ops/posts";
import { adminOps } from "@/lib/ops/session";
import { requireUser, sessionMiddleware, widgetSessionMiddleware } from "@/lib/session";

function originFromRequest(): string {
  try {
    return new URL(getRequest().url).origin;
  } catch {
    return "";
  }
}

function escapeLike(s: string) {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

// Every mutation checks the post is in this workspace before touching it.
async function ownBoard(db: ReturnType<typeof createDb>, boardId: string, workspaceId: string) {
  const [row] = await db.select({ id: board.id }).from(board).where(and(eq(board.id, boardId), eq(board.workspaceId, workspaceId))).limit(1);
  if (!row) throw new Error("Board not found");
}

// Drops any tag id that does not belong to this workspace.
async function ownTags(db: ReturnType<typeof createDb>, tagIds: string[], workspaceId: string): Promise<string[]> {
  if (!tagIds.length) return [];
  const rows = await db.select({ id: tag.id }).from(tag).where(and(inArray(tag.id, tagIds), eq(tag.workspaceId, workspaceId)));
  return rows.map((r) => r.id);
}

async function ownPost(db: ReturnType<typeof createDb>, postId: number, workspaceId: string) {
  const [row] = await db.select({ id: post.id }).from(post).where(and(eq(post.id, postId), eq(post.workspaceId, workspaceId))).limit(1);
  if (!row) throw new Error("Post not found");
}

// Ids from /api/uploads: the caller's own unclaimed uploads, or the submit fails.
const attachmentIds = z.array(z.string().max(40)).max(MAX_IMAGES, `Up to ${MAX_IMAGES} images each`).default([]);
const attachmentColumns = { id: true, contentType: true, width: true, height: true } as const;

const listInput = z.object({
  board: z.string().optional(),
  status: z.string().max(40).optional(),
  tag: z.string().optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(["trending", "top", "new"]).default("trending"),
  limit: z.number().int().min(1).max(100).default(30),
  offset: z.number().int().min(0).default(0),
});
export type ListInput = z.infer<typeof listInput>;

export const listPosts = createServerFn({ method: "GET" })
  .middleware([widgetSessionMiddleware])
  .validator((d: unknown) => listInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const db = createDb();
    const isAdmin = context.user?.role === "admin";
    const reviewKeys = context.workspace.requireApproval && !isAdmin
      ? (await listStatuses(db, context.workspace.id)).filter((s) => s.kind === "review").map((s) => s.key)
      : [];
    const where = and(
      eq(post.workspaceId, context.workspace.id),
      sql`${post.mergedIntoId} is null`,
      reviewKeys.length ? sql`${post.status} not in (${sql.join(reviewKeys.map((k) => sql`${k}`), sql`, `)})` : undefined,
      data.board ? eq(post.boardId, data.board) : undefined,
      data.status ? eq(post.status, data.status) : undefined,
      data.q ? or(like(post.title, `%${escapeLike(data.q)}%`), like(post.body, `%${escapeLike(data.q)}%`)) : undefined,
      data.tag
        ? inArray(post.id, db.select({ id: postTag.postId }).from(postTag).where(eq(postTag.tagId, data.tag)))
        : undefined,
    );
    // Trending: votes decayed by age, so a fresh post with 10 votes beats a
    // year-old one with 12. Plain arithmetic only: SQLite has no pow() unless
    // built with math functions, and D1 and libsql differ there.
    const ageDays = sql`(julianday('now') - julianday(${post.createdAt} / 1000, 'unixepoch'))`;
    const trending = sql`(${post.voteCount} + 1.0) / ((${ageDays} + 2.0) * (${ageDays} + 2.0))`;
    const order =
      data.sort === "new"
        ? [desc(post.pinned), desc(post.createdAt)]
        : data.sort === "top"
          ? [desc(post.pinned), desc(post.voteCount), desc(post.createdAt)]
          : [desc(post.pinned), desc(trending)];

    const rows = await db.query.post.findMany({
      where,
      orderBy: order,
      limit: data.limit,
      offset: data.offset,
      with: {
        author: { columns: { id: true, name: true, image: true } },
        tags: { with: { tag: true } },
        votes: context.user ? { where: eq(vote.userId, context.user.id), columns: { userId: true } } : { limit: 0 },
      },
    });
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(post).where(where);
    return {
      posts: rows.map((r) => ({
        id: r.id,
        title: r.title,
        excerpt: r.body.length > 180 ? r.body.slice(0, 177).trimEnd() + "…" : r.body,
        status: r.status,
        pinned: r.pinned,
        voteCount: r.voteCount,
        commentCount: r.commentCount,
        boardId: r.boardId,
        createdAt: r.createdAt,
        author: r.author,
        tags: r.tags.map((t) => t.tag),
        voted: r.votes.length > 0,
      })),
      total,
    };
  });

export const getPost = createServerFn({ method: "GET" })
  .middleware([widgetSessionMiddleware])
  .validator((d: unknown) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = createDb();
    const p = await db.query.post.findFirst({
      where: and(eq(post.id, data.id), eq(post.workspaceId, context.workspace.id)),
      with: {
        board: true,
        author: { columns: { id: true, name: true, image: true } },
        tags: { with: { tag: true } },
        comments: {
          where: context.user?.role === "admin" ? undefined : eq(comment.internal, false),
          with: { author: { columns: { id: true, name: true, image: true, role: true } }, reactions: { columns: { userId: true, emoji: true } }, attachments: { columns: attachmentColumns, orderBy: [asc(attachment.createdAt)] } },
          orderBy: [desc(comment.createdAt)],
        },
        activity: { with: { actor: { columns: { id: true, name: true } } }, orderBy: [desc(activity.createdAt)] },
        votes: { with: { user: { columns: { id: true, name: true, image: true } } }, orderBy: [desc(vote.createdAt)], limit: 8 },
        attachments: { columns: attachmentColumns, orderBy: [asc(attachment.createdAt)] },
      },
    });
    if (!p) return null;
    if (context.workspace.requireApproval) {
      const statuses = await listStatuses(db, context.workspace.id);
      const postStatus = statuses.find((s) => s.key === p.status);
      if (postStatus?.kind === "review") {
        const isAuthor = context.user && p.authorId === context.user.id;
        const isAdmin = context.user?.role === "admin";
        if (!isAuthor && !isAdmin) return null;
      }
    }
    const voted = context.user
      ? (await db.select({ userId: vote.userId }).from(vote).where(and(eq(vote.postId, p.id), eq(vote.userId, context.user.id)))).length > 0
      : false;
    // Merge candidates: posts whose titles share a word of 5+ letters.
    const similar = (await similarPosts({ db, workspace: context.workspace, actor: null, origin: "" }, p.title, { excludeId: p.id, limit: 3 })).map(({ id, title, voteCount }) => ({ id, title, voteCount }));
    const mergedInto = p.mergedIntoId
      ? await db.query.post.findFirst({ where: eq(post.id, p.mergedIntoId), columns: { id: true, title: true } })
      : null;
    const mergedFrom = await db.select({ id: post.id, title: post.title, voteCount: post.voteCount }).from(post).where(eq(post.mergedIntoId, p.id));
    return {
      ...p,
      tags: p.tags.map((t) => t.tag),
      attachments: p.attachments.map((a) => toAttachmentView(a)),
      voted,
      similar,
      mergedInto,
      mergedFrom,
      timeline: [
        ...p.comments.map((c) => ({
          kind: "comment" as const,
          id: `c${c.id}`,
          commentId: c.id,
          at: c.createdAt,
          author: c.author,
          body: c.body,
          internal: c.internal,
          attachments: c.attachments.map((a) => toAttachmentView(a)),
          // Grouped: [{ emoji, count, mine }]
          reactions: Object.values(
            c.reactions.reduce<Record<string, { emoji: string; count: number; mine: boolean }>>((acc, r) => {
              const g = (acc[r.emoji] ??= { emoji: r.emoji, count: 0, mine: false });
              g.count++;
              if (context.user && r.userId === context.user.id) g.mine = true;
              return acc;
            }, {}),
          ),
        })),
        ...p.activity.map((a) => ({ kind: "activity" as const, id: `a${a.id}`, at: a.createdAt, author: a.actor, type: a.type, from: a.fromStatus, to: a.toStatus, note: a.note })),
      ].sort((a, b) => +new Date(b.at) - +new Date(a.at)),
    };
  });

export const createPost = createServerFn({ method: "POST" })
  .middleware([widgetSessionMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        boardId: z.string().min(1, "Pick a board first"),
        title: z.string().trim().min(4, "Give it a title").max(140),
        body: z.string().trim().max(5000).default(""),
        tags: z.array(z.string()).max(5).default([]),
        attachments: attachmentIds,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const u = requireUser(context.user);
    if (context.workspace.whoCanPost === "members" && u.role === "guest") throw new Error("Only team members can post on this board");
    const db = createDb();
    await ownBoard(db, data.boardId, context.workspace.id);
    const tagIds = await ownTags(db, data.tags, context.workspace.id);
    let initialStatus = "open";
    if (context.workspace.requireApproval && u.role !== "admin") {
      const reviewStatus = await statusOfKind(db, context.workspace.id, "review");
      if (reviewStatus) initialStatus = reviewStatus.key;
    }
    const owner = { workspaceId: context.workspace.id, uploaderId: u.id };
    const images = await reserveAttachments(db, data.attachments, owner);
    // One batch, so nothing is published unless all of it is. The statements
    // after the insert find the new post as this author's newest.
    const newest = sql<number>`(select max(${post.id}) from ${post} where ${post.authorId} = ${u.id})`;
    const steps = [
      db
        .insert(post)
        .values({ workspaceId: context.workspace.id, boardId: data.boardId, authorId: u.id, title: data.title, body: data.body, voteCount: 1, status: initialStatus })
        .returning({ id: post.id }),
      claimQuery(db, images, owner, { postId: newest }),
      db.insert(vote).values({ postId: newest, userId: u.id }),
      ...(tagIds.length ? [db.insert(postTag).values(tagIds.map((tagId) => ({ postId: newest, tagId })))] : []),
    ];
    const [[created], claimed] = (await db.batch(steps as unknown as Parameters<typeof db.batch>[0])) as unknown as [{ id: number }[], { id: string }[]];
    if (claimed.length !== images.length) {
      // Only a second submit of the same images gets here: the first one took them.
      await db.batch([db.update(attachment).set({ postId: null }).where(eq(attachment.postId, created!.id)), db.delete(post).where(eq(post.id, created!.id))]);
      throw new AttachmentGoneError();
    }
    void invalidate(`workspace:${context.workspace.id}`);
    purgeWorkspaceCache(originFromRequest());
    notifyIntegrations(db, context.workspace.id, { type: "post.created", postId: created!.id }, originFromRequest());
    return { id: created!.id, pending: initialStatus !== "open" };
  });

export const toggleVote = createServerFn({ method: "POST" })
  .middleware([widgetSessionMiddleware])
  .validator((d: unknown) => z.object({ postId: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    const u = requireUser(context.user);
    const ctx = { db: createDb(), workspace: context.workspace, actor: u, origin: originFromRequest() };
    return setVote(ctx, data.postId, u.id);
  });

export const toggleAnonVote = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ postId: z.number().int(), anonToken: z.string().min(16).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!context.workspace.anonymousVoting) throw new Error("Anonymous voting is not enabled");
    const db = createDb();
    await ownPost(db, data.postId, context.workspace.id);
    const existing = await db
      .select()
      .from(anonymousVote)
      .where(and(eq(anonymousVote.postId, data.postId), eq(anonymousVote.anonToken, data.anonToken)));
    if (existing.length) {
      await db.delete(anonymousVote).where(and(eq(anonymousVote.postId, data.postId), eq(anonymousVote.anonToken, data.anonToken)));
      await db.update(post).set({ voteCount: sql`max(${post.voteCount} - 1, 0)` }).where(eq(post.id, data.postId));
      purgeWorkspaceCache(originFromRequest(), [data.postId]);
      return { voted: false };
    }
    await db.insert(anonymousVote).values({ postId: data.postId, anonToken: data.anonToken });
    await db.update(post).set({ voteCount: sql`${post.voteCount} + 1` }).where(eq(post.id, data.postId));
    purgeWorkspaceCache(originFromRequest(), [data.postId]);
    return { voted: true };
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([widgetSessionMiddleware])
  .validator((d: unknown) =>
    z
      .object({ postId: z.number().int(), body: z.string().trim().max(5000), internal: z.boolean().default(false), attachments: attachmentIds })
      .refine((c) => c.body.length > 0 || c.attachments.length > 0, "Write something or attach an image")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const u = requireUser(context.user);
    const ctx = { db: createDb(), workspace: context.workspace, actor: u, origin: originFromRequest() };
    await addCommentOp(ctx, { postId: data.postId, body: data.body, internal: data.internal && u.role === "admin", attachments: data.attachments });
    return { ok: true };
  });

export const REACTIONS = ["👍", "❤️", "🎉", "👀", "🚀", "😂"] as const;

export const toggleReaction = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ commentId: z.number().int(), emoji: z.enum(REACTIONS) }).parse(d))
  .handler(async ({ data, context }) => {
    const u = requireUser(context.user);
    const db = createDb();
    const [c] = await db.select({ postId: comment.postId }).from(comment).where(eq(comment.id, data.commentId)).limit(1);
    if (!c) throw new Error("Comment not found");
    await ownPost(db, c.postId, context.workspace.id);
    const existing = await db.select().from(commentReaction).where(and(eq(commentReaction.commentId, data.commentId), eq(commentReaction.userId, u.id), eq(commentReaction.emoji, data.emoji)));
    if (existing.length) {
      await db.delete(commentReaction).where(and(eq(commentReaction.commentId, data.commentId), eq(commentReaction.userId, u.id), eq(commentReaction.emoji, data.emoji)));
      return { on: false };
    }
    await db.insert(commentReaction).values({ commentId: data.commentId, userId: u.id, emoji: data.emoji });
    return { on: true };
  });

// ---- admin ----

export const setStatus = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ postId: z.number().int(), status: z.string().max(40), note: z.string().trim().max(2000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await setPostStatus(adminOps(context), data.postId, data.status, data.note);
    return { ok: true };
  });

export const togglePin = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ postId: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => setPinned(adminOps(context), data.postId));

export const mergePosts = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ from: z.number().int(), into: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    await mergePostsOp(adminOps(context), data.from, data.into);
    return { ok: true, into: data.into };
  });

export const setTags = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ postId: z.number().int(), tags: z.array(z.string()).max(8) }).parse(d))
  .handler(async ({ data, context }) => {
    await setPostTags(adminOps(context), data.postId, data.tags);
    return { ok: true };
  });

export const setEta = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ postId: z.number().int(), eta: z.string().trim().max(40).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await setPostEta(adminOps(context), data.postId, data.eta);
    return { ok: true };
  });

// Roadmap: every non-merged post grouped by status, most voted first.
export const getRoadmap = createServerFn({ method: "GET" })
  .middleware([widgetSessionMiddleware])
  .validator((d: unknown) => z.object({ board: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const db = createDb();
    const roadmapFilter = and(eq(status.workspaceId, context.workspace.id), eq(status.onRoadmap, true));
    const isAdmin = context.user?.role === "admin";
    const statusFilter = context.workspace.requireApproval && !isAdmin
      ? and(roadmapFilter, sql`${status.kind} != 'review'`)
      : roadmapFilter;
    const rows = await db.query.post.findMany({
      where: and(eq(post.workspaceId, context.workspace.id), sql`${post.mergedIntoId} is null`, data.board ? eq(post.boardId, data.board) : undefined, inArray(post.status, db.select({ key: status.key }).from(status).where(statusFilter))),
      orderBy: [desc(post.pinned), desc(post.voteCount)],
      with: {
        tags: { with: { tag: true } },
        votes: context.user ? { where: eq(vote.userId, context.user.id), columns: { userId: true } } : { limit: 0 },
      },
      columns: { id: true, title: true, status: true, boardId: true, voteCount: true, commentCount: true, eta: true, statusChangedAt: true },
    });
    return rows.map((r) => ({ ...r, tags: r.tags.map((t) => t.tag), voted: r.votes.length > 0, votes: undefined }));
  });

export const searchPosts = createServerFn({ method: "GET" })
  .middleware([widgetSessionMiddleware])
  .validator((d: unknown) => z.object({ q: z.string().trim().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = createDb();
    // Match on words, not the whole phrase, so "Slack notification for new
    // posts" still finds "Slack notification when a post changes status".
    const words = data.q.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
    const terms = words.length ? words.slice(0, 5) : [data.q.toLowerCase()];
    const escaped = terms.map(escapeLike);
    // Posts waiting for approval stay out of everyone's search but the team's, as on the board.
    const reviewKeys = context.workspace.requireApproval && context.user?.role !== "admin"
      ? (await listStatuses(db, context.workspace.id)).filter((s) => s.kind === "review").map((s) => s.key)
      : [];
    const hits = sql.join(escaped.map((w) => sql`(lower(${post.title}) like ${"%" + w + "%"} escape '\\')`), sql` + `);
    return db
      .select({ id: post.id, title: post.title, voteCount: post.voteCount, status: post.status })
      .from(post)
      .where(
        and(
          eq(post.workspaceId, context.workspace.id),
          sql`${post.mergedIntoId} is null`,
          reviewKeys.length ? sql`${post.status} not in (${sql.join(reviewKeys.map((k) => sql`${k}`), sql`, `)})` : undefined,
          or(...escaped.map((w) => like(post.title, `%${w}%`))),
        ),
      )
      .orderBy(desc(hits), desc(post.voteCount))
      .limit(8);
  });

