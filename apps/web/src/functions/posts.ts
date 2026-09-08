import { activity, anonymousVote, comment, commentReaction, createDb, post, postTag, status, vote } from "@openheard/db";

import { purgeWorkspaceCache } from "@/lib/cache";
import { assertStatus, listStatuses, statusOfKind } from "@/lib/status-db";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod";

import { requireAdmin, requireUser, sessionMiddleware } from "@/lib/session";

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
async function ownPost(db: ReturnType<typeof createDb>, postId: number, workspaceId: string) {
  const [row] = await db.select({ id: post.id }).from(post).where(and(eq(post.id, postId), eq(post.workspaceId, workspaceId))).limit(1);
  if (!row) throw new Error("Post not found");
}

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
  .middleware([sessionMiddleware])
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
  .middleware([sessionMiddleware])
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
          with: { author: { columns: { id: true, name: true, image: true, role: true } }, reactions: { columns: { userId: true, emoji: true } } },
          orderBy: [desc(comment.createdAt)],
        },
        activity: { with: { actor: { columns: { id: true, name: true } } }, orderBy: [desc(activity.createdAt)] },
        votes: { with: { user: { columns: { id: true, name: true, image: true } } }, orderBy: [desc(vote.createdAt)], limit: 8 },
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
    // Merge candidates: same board, shares a word of 5+ letters with the title.
    const words = p.title.toLowerCase().match(/[a-z]{5,}/g) ?? [];
    const similar = words.length
      ? await db
          .select({ id: post.id, title: post.title, voteCount: post.voteCount })
          .from(post)
          .where(and(eq(post.workspaceId, p.workspaceId), sql`${post.id} != ${p.id}`, sql`${post.mergedIntoId} is null`, or(...words.slice(0, 4).map((w) => like(post.title, `%${escapeLike(w)}%`)))))
          .orderBy(desc(post.voteCount))
          .limit(3)
      : [];
    const mergedInto = p.mergedIntoId
      ? await db.query.post.findFirst({ where: eq(post.id, p.mergedIntoId), columns: { id: true, title: true } })
      : null;
    const mergedFrom = await db.select({ id: post.id, title: post.title, voteCount: post.voteCount }).from(post).where(eq(post.mergedIntoId, p.id));
    return {
      ...p,
      tags: p.tags.map((t) => t.tag),
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
  .middleware([sessionMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        boardId: z.string().min(1, "Pick a board first"),
        title: z.string().trim().min(4, "Give it a title").max(140),
        body: z.string().trim().max(5000).default(""),
        tags: z.array(z.string()).max(5).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const u = requireUser(context.user);
    if (context.workspace.whoCanPost === "members" && u.role === "guest") throw new Error("Only team members can post on this board");
    const db = createDb();
    let initialStatus = "open";
    if (context.workspace.requireApproval && u.role !== "admin") {
      const reviewStatus = await statusOfKind(db, context.workspace.id, "review");
      if (reviewStatus) initialStatus = reviewStatus.key;
    }
    const [created] = await db
      .insert(post)
      .values({ workspaceId: context.workspace.id, boardId: data.boardId, authorId: u.id, title: data.title, body: data.body, voteCount: 1, status: initialStatus })
      .returning({ id: post.id });
    await db.insert(vote).values({ postId: created.id, userId: u.id });
    if (data.tags.length) await db.insert(postTag).values(data.tags.map((tagId) => ({ postId: created.id, tagId })));
    purgeWorkspaceCache(originFromRequest());
    return { id: created.id, pending: initialStatus !== "open" };
  });

export const toggleVote = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ postId: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    const u = requireUser(context.user);
    const db = createDb();
    await ownPost(db, data.postId, context.workspace.id);
    const existing = await db.select().from(vote).where(and(eq(vote.postId, data.postId), eq(vote.userId, u.id)));
    if (existing.length) {
      await db.delete(vote).where(and(eq(vote.postId, data.postId), eq(vote.userId, u.id)));
      await db.update(post).set({ voteCount: sql`max(${post.voteCount} - 1, 0)` }).where(eq(post.id, data.postId));
      purgeWorkspaceCache(originFromRequest(), [data.postId]);
      return { voted: false };
    }
    await db.insert(vote).values({ postId: data.postId, userId: u.id });
    await db.update(post).set({ voteCount: sql`${post.voteCount} + 1` }).where(eq(post.id, data.postId));
    purgeWorkspaceCache(originFromRequest(), [data.postId]);
    return { voted: true };
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
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ postId: z.number().int(), body: z.string().trim().min(1).max(5000), internal: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const u = requireUser(context.user);
    const internal = data.internal && u.role === "admin";
    const db = createDb();
    await ownPost(db, data.postId, context.workspace.id);
    await db.insert(comment).values({ postId: data.postId, authorId: u.id, body: data.body, internal });
    if (!internal) await db.update(post).set({ commentCount: sql`${post.commentCount} + 1` }).where(eq(post.id, data.postId));
    if (!internal) purgeWorkspaceCache(originFromRequest(), [data.postId]);
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
    const u = requireAdmin(context.user);
    const db = createDb();
    await ownPost(db, data.postId, context.workspace.id);
    await assertStatus(db, context.workspace.id, data.status);
    const [current] = await db.select({ status: post.status }).from(post).where(eq(post.id, data.postId));
    if (!current || current.status === data.status) return { ok: true };
    await db.update(post).set({ status: data.status, statusChangedAt: new Date() }).where(eq(post.id, data.postId));
    await db.insert(activity).values({ postId: data.postId, actorId: u.id, type: "status", fromStatus: current.status, toStatus: data.status, note: data.note || null });
    purgeWorkspaceCache(originFromRequest(), [data.postId]);
    return { ok: true };
  });

export const togglePin = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ postId: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    const u = requireAdmin(context.user);
    const db = createDb();
    await ownPost(db, data.postId, context.workspace.id);
    const [current] = await db.select({ pinned: post.pinned }).from(post).where(eq(post.id, data.postId));
    if (!current) return { pinned: false };
    await db.update(post).set({ pinned: !current.pinned }).where(eq(post.id, data.postId));
    await db.insert(activity).values({ postId: data.postId, actorId: u.id, type: "pin", note: current.pinned ? "unpinned" : "pinned" });
    purgeWorkspaceCache(originFromRequest(), [data.postId]);
    return { pinned: !current.pinned };
  });

// Merge `from` into `into`: votes are summed (one per user), comments move,
// the merged post keeps a pointer so its old URL still resolves.
export const mergePosts = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ from: z.number().int(), into: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    const u = requireAdmin(context.user);
    if (data.from === data.into) throw new Error("Pick a different post");
    const db = createDb();
    await ownPost(db, data.from, context.workspace.id);
    await ownPost(db, data.into, context.workspace.id);
    const fromVotes = await db.select({ userId: vote.userId }).from(vote).where(eq(vote.postId, data.from));
    const intoVotes = new Set((await db.select({ userId: vote.userId }).from(vote).where(eq(vote.postId, data.into))).map((v) => v.userId));
    const moved = fromVotes.filter((v) => !intoVotes.has(v.userId));
    if (moved.length) await db.insert(vote).values(moved.map((v) => ({ postId: data.into, userId: v.userId })));
    await db.update(comment).set({ postId: data.into }).where(eq(comment.postId, data.from));
    const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(comment).where(eq(comment.postId, data.into));
    await db.update(post).set({ voteCount: sql`${post.voteCount} + ${moved.length}`, commentCount: c }).where(eq(post.id, data.into));
    const closed = await statusOfKind(db, context.workspace.id, "closed");
    await db.update(post).set({ mergedIntoId: data.into, status: closed?.key ?? "closed" }).where(eq(post.id, data.from));
    const [target] = await db.select({ title: post.title }).from(post).where(eq(post.id, data.into));
    const [source] = await db.select({ title: post.title }).from(post).where(eq(post.id, data.from));
    await db.insert(activity).values([
      { postId: data.into, actorId: u.id, type: "merge", note: `merged "${source?.title}" into this, +${moved.length} votes` },
      { postId: data.from, actorId: u.id, type: "merge", note: `merged into "${target?.title}"` },
    ]);
    purgeWorkspaceCache(originFromRequest(), [data.from, data.into]);
    return { ok: true, into: data.into };
  });

export const setTags = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ postId: z.number().int(), tags: z.array(z.string()).max(8) }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const db = createDb();
    await ownPost(db, data.postId, context.workspace.id);
    await db.delete(postTag).where(eq(postTag.postId, data.postId));
    if (data.tags.length) await db.insert(postTag).values(data.tags.map((tagId) => ({ postId: data.postId, tagId })));
    purgeWorkspaceCache(originFromRequest(), [data.postId]);
    return { ok: true };
  });

export const setEta = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ postId: z.number().int(), eta: z.string().trim().max(40).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    await createDb().update(post).set({ eta: data.eta || null }).where(and(eq(post.id, data.postId), eq(post.workspaceId, context.workspace.id)));
    purgeWorkspaceCache(originFromRequest(), [data.postId]);
    return { ok: true };
  });

// Roadmap: every non-merged post grouped by status, most voted first.
export const getRoadmap = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
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
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ q: z.string().trim().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = createDb();
    // Match on words, not the whole phrase, so "Slack notification for new
    // posts" still finds "Slack notification when a post changes status".
    const words = data.q.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
    const terms = words.length ? words.slice(0, 5) : [data.q.toLowerCase()];
    const escaped = terms.map(escapeLike);
    const hits = sql.join(escaped.map((w) => sql`(lower(${post.title}) like ${"%" + w + "%"} escape '\\')`), sql` + `);
    return db
      .select({ id: post.id, title: post.title, voteCount: post.voteCount, status: post.status })
      .from(post)
      .where(and(eq(post.workspaceId, context.workspace.id), sql`${post.mergedIntoId} is null`, or(...escaped.map((w) => like(post.title, `%${w}%`)))))
      .orderBy(desc(hits), desc(post.voteCount))
      .limit(8);
  });

