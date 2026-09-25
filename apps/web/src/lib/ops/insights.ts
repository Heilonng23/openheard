import { board, comment, membership, post, vote } from "@openheard/db";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";

import { listStatuses } from "@/lib/status-db";

import type { OpCtx } from "./context";

const DAY = 86_400_000;

// A one-call picture of the board for a weekly review: where posts sit, what
// people want most, what picked up votes this week, and what has sat in
// planned or in progress for too long.
export async function summarizeFeedback(ctx: OpCtx, opts: { staleDays?: number; top?: number } = {}) {
  const { db } = ctx;
  const ws = ctx.workspace.id;
  const top = opts.top ?? 5;
  const staleDays = opts.staleDays ?? 30;
  const week = new Date(Date.now() - 7 * DAY);
  const live = and(eq(post.workspaceId, ws), sql`${post.mergedIntoId} is null`);
  const inWs = db.select({ id: post.id }).from(post).where(eq(post.workspaceId, ws));
  const statuses = await listStatuses(db, ws);
  // Top voted leaves out what is already shipped or closed.
  const wantedKeys = statuses.filter((s) => s.kind !== "done" && s.kind !== "closed").map((s) => s.key);
  const openKeys = statuses.filter((s) => s.kind === "open").map((s) => s.key);
  const activeKeys = statuses.filter((s) => s.kind === "planned" || s.kind === "progress").map((s) => s.key);
  const teamComment = db
    .select({ postId: comment.postId })
    .from(comment)
    .innerJoin(membership, and(eq(membership.userId, comment.authorId), eq(membership.workspaceId, ws)))
    .where(eq(membership.role, "admin"));

  const [byStatus, byBoard, topVoted, rising, stale, needsReply, [newThisWeek]] = await Promise.all([
    db.select({ status: post.status, n: sql<number>`count(*)` }).from(post).where(live).groupBy(post.status),
    db.select({ id: board.id, name: board.name, n: sql<number>`count(${post.id})` }).from(board).leftJoin(post, and(eq(post.boardId, board.id), sql`${post.mergedIntoId} is null`)).where(eq(board.workspaceId, ws)).groupBy(board.id),
    wantedKeys.length
      ? db
          .select({ id: post.id, title: post.title, votes: post.voteCount, status: post.status })
          .from(post)
          .where(and(live, inArray(post.status, wantedKeys)))
          .orderBy(desc(post.voteCount))
          .limit(top)
      : Promise.resolve([]),
    db
      .select({ id: post.id, title: post.title, status: post.status, votesThisWeek: sql<number>`count(*)` })
      .from(vote)
      .innerJoin(post, eq(post.id, vote.postId))
      .where(and(gt(vote.createdAt, week), inArray(vote.postId, inWs), sql`${post.mergedIntoId} is null`))
      .groupBy(post.id)
      .orderBy(desc(sql`count(*)`))
      .limit(top),
    activeKeys.length
      ? db
          .select({ id: post.id, title: post.title, status: post.status, votes: post.voteCount, since: post.statusChangedAt })
          .from(post)
          .where(and(live, inArray(post.status, activeKeys), lt(post.statusChangedAt, new Date(Date.now() - staleDays * DAY))))
          .orderBy(post.statusChangedAt)
          .limit(top)
      : Promise.resolve([]),
    openKeys.length
      ? db
          .select({ id: post.id, title: post.title, votes: post.voteCount, createdAt: post.createdAt })
          .from(post)
          .where(and(live, inArray(post.status, openKeys), sql`${post.id} not in ${teamComment}`))
          .orderBy(desc(post.createdAt))
          .limit(top * 2)
      : Promise.resolve([]),
    db.select({ n: sql<number>`count(*)` }).from(post).where(and(live, gt(post.createdAt, week))),
  ]);

  const counts = new Map(byStatus.map((r) => [r.status, r.n]));
  return {
    total: byStatus.reduce((n, r) => n + r.n, 0),
    newThisWeek: newThisWeek?.n ?? 0,
    byStatus: statuses.map((s) => ({ key: s.key, label: s.label, kind: s.kind, posts: counts.get(s.key) ?? 0 })),
    byBoard: byBoard.map((b) => ({ id: b.id, name: b.name, posts: b.n })),
    topVoted,
    risingThisWeek: rising,
    stalePlanned: stale.map((p) => ({ ...p, daysInStatus: Math.floor((Date.now() - +new Date(p.since)) / DAY), since: undefined })),
    needsReply,
  };
}
