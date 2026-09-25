import { activity, comment, createDb, membership, post, postTag, status, vote, workspace } from "@openheard/db";

import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { DEMO_ADMIN_ID, assertNotDemo, assertNotDemoIdentity } from "@/lib/demo";
import { setPostBoard } from "@/lib/ops/posts";
import { adminOps } from "@/lib/ops/session";
import { RESERVED_SLUGS, createWorkspace as createWorkspaceOp, listMembers as listMembersOp, slugify } from "@/lib/ops/workspace";
import { requireAdmin, requireUser, sessionMiddleware } from "@/lib/session";

const DAY = 86_400_000;

// Everything the overview needs in one round trip.
export const getOverview = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    requireAdmin(context.user);
    const db = createDb();
    const week = new Date(Date.now() - 7 * DAY);
    const month = new Date(Date.now() - 30 * DAY);
    const wsId = context.workspace.id;
    const live = and(eq(post.workspaceId, wsId), sql`${post.mergedIntoId} is null`);
    const inWs = db.select({ id: post.id }).from(post).where(eq(post.workspaceId, wsId));

    const [openRows, doneRows] = await db.batch([
      db.select().from(status).where(and(eq(status.workspaceId, wsId), eq(status.kind, "open"))).orderBy(asc(status.position)).limit(1),
      db.select().from(status).where(and(eq(status.workspaceId, wsId), eq(status.kind, "done"))).orderBy(asc(status.position)).limit(1),
    ] as const);
    const openKey = openRows[0]?.key ?? "open";
    const doneKey = doneRows[0]?.key ?? "done";

    const twoWeeks = new Date(Date.now() - 14 * DAY);
    const twoMonths = new Date(Date.now() - 60 * DAY);
    const [[votesWeek], [votesPrev], [commentsWeek], [commentsPrev], [shippedMonth], [shippedPrev], [pending]] = await db.batch([
      db.select({ n: sql<number>`count(*)`, posts: sql<number>`count(distinct ${vote.postId})` }).from(vote).where(and(gt(vote.createdAt, week), inArray(vote.postId, inWs))),
      db.select({ n: sql<number>`count(*)` }).from(vote).where(and(gt(vote.createdAt, twoWeeks), lte(vote.createdAt, week), inArray(vote.postId, inWs))),
      db.select({ n: sql<number>`count(*)` }).from(comment).where(and(gt(comment.createdAt, week), eq(comment.internal, false), inArray(comment.postId, inWs))),
      db.select({ n: sql<number>`count(*)` }).from(comment).where(and(gt(comment.createdAt, twoWeeks), lte(comment.createdAt, week), eq(comment.internal, false), inArray(comment.postId, inWs))),
      db.select({ n: sql<number>`count(*)` }).from(post).where(and(live, eq(post.status, doneKey), gt(post.statusChangedAt, month))),
      db.select({ n: sql<number>`count(*)` }).from(post).where(and(live, eq(post.status, doneKey), gt(post.statusChangedAt, twoMonths), lte(post.statusChangedAt, month))),
      db.select({ n: sql<number>`count(*)` }).from(post).where(and(live, eq(post.status, openKey))),
    ] as const);

    // "Needs a reply": open posts where nobody on the team has commented yet.
    const teamComment = db
      .select({ postId: comment.postId })
      .from(comment)
      .innerJoin(membership, and(eq(membership.userId, comment.authorId), eq(membership.workspaceId, wsId)))
      .where(eq(membership.role, "admin"));
    const needsReply = await db.query.post.findMany({
      where: and(live, eq(post.status, openKey), sql`${post.id} not in ${teamComment}`),
      orderBy: [desc(post.createdAt)],
      limit: 6,
      with: { author: { columns: { name: true } }, board: { columns: { name: true } } },
      columns: { id: true, title: true, voteCount: true, createdAt: true },
    });
    const oldest = needsReply.length ? Math.max(...needsReply.map((p) => Date.now() - +new Date(p.createdAt))) : 0;

    const [recentVotes, recentComments, recentActivity] = await Promise.all([
      db.query.vote.findMany({ where: inArray(vote.postId, inWs), orderBy: [desc(vote.createdAt)], limit: 6, with: { user: { columns: { name: true, image: true } }, post: { columns: { id: true, title: true } } } }),
      db.query.comment.findMany({ where: and(eq(comment.internal, false), inArray(comment.postId, inWs)), orderBy: [desc(comment.createdAt)], limit: 6, with: { author: { columns: { name: true, image: true } }, post: { columns: { id: true, title: true } } } }),
      db.query.activity.findMany({ where: and(eq(activity.type, "status"), inArray(activity.postId, inWs)), orderBy: [desc(activity.createdAt)], limit: 6, with: { actor: { columns: { name: true, image: true } }, post: { columns: { id: true, title: true } } } }),
    ]);
    const feed = [
      ...recentVotes.map((v) => ({ kind: "vote" as const, at: v.createdAt, who: v.user, post: v.post, to: null as string | null })),
      ...recentComments.map((c) => ({ kind: "comment" as const, at: c.createdAt, who: c.author, post: c.post, to: null as string | null })),
      ...recentActivity.map((a) => ({ kind: "status" as const, at: a.createdAt, who: a.actor, post: a.post, to: a.toStatus })),
    ]
      .sort((a, b) => +new Date(b.at) - +new Date(a.at))
      .slice(0, 8);

    return {
      stats: {
        pending: pending.n,
        votesWeek: votesWeek.n,
        votesPosts: votesWeek.posts,
        votesDelta: votesWeek.n - votesPrev.n,
        commentsWeek: commentsWeek.n,
        commentsDelta: commentsWeek.n - commentsPrev.n,
        shippedMonth: shippedMonth.n,
        shippedDelta: shippedMonth.n - shippedPrev.n,
      },
      needsReply,
      oldestDays: Math.floor(oldest / DAY),
      feed,
    };
  });

// The inbox list: one status at a time, newest first by default.
export const listInbox = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ status: z.string().max(40).optional(), sort: z.enum(["new", "top", "old"]).default("new"), board: z.string().optional(), tag: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const db = createDb();
    const rows = await db.query.post.findMany({
      where: and(
        eq(post.workspaceId, context.workspace.id),
        sql`${post.mergedIntoId} is null`,
        data.status ? eq(post.status, data.status) : undefined,
        data.board ? eq(post.boardId, data.board) : undefined,
        data.tag ? inArray(post.id, db.select({ id: postTag.postId }).from(postTag).where(eq(postTag.tagId, data.tag))) : undefined,
      ),
      orderBy: data.sort === "top" ? [desc(post.voteCount)] : data.sort === "old" ? [post.createdAt] : [desc(post.createdAt)],
      limit: 100,
      with: { author: { columns: { name: true, image: true } }, board: { columns: { id: true, name: true } }, tags: { with: { tag: { columns: { id: true, name: true } } } } },
      columns: { id: true, title: true, body: true, status: true, voteCount: true, commentCount: true, createdAt: true, pinned: true },
    });
    // Trending: the three posts with the most votes this week, and at least three.
    const week = new Date(Date.now() - 7 * DAY);
    const hot = new Set(
      (
        await db
          .select({ postId: vote.postId, n: sql<number>`count(*)` })
          .from(vote)
          .where(and(gt(vote.createdAt, week), inArray(vote.postId, rows.map((r) => r.id))))
          .groupBy(vote.postId)
          .having(sql`count(*) >= 3`)
          .orderBy(desc(sql`count(*)`))
          .limit(3)
      ).map((v) => v.postId),
    );
    return rows.map((r) => ({ ...r, tags: r.tags.map((t) => t.tag), trending: hot.has(r.id), excerpt: r.body.length > 120 ? r.body.slice(0, 117).trimEnd() + "…" : r.body, body: undefined }));
  });

export const listMembers = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => (await listMembersOp(adminOps(context))).members);

export const setRole = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ userId: z.string(), role: z.enum(["admin", "member"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const me = requireAdmin(context.user);
    assertNotDemo(context.workspace);
    // The shared demo login must never gain a membership anywhere else: that
    // membership is also what marks the demo workspace as ours to reset.
    if (data.userId === DEMO_ADMIN_ID) throw new Error("Reserved account");
    if (data.userId === me.id && data.role !== "admin") throw new Error("You cannot remove your own admin role");
    await createDb()
      .insert(membership)
      .values({ workspaceId: context.workspace.id, userId: data.userId, role: data.role })
      .onConflictDoUpdate({ target: [membership.workspaceId, membership.userId], set: { role: data.role } });
    return { ok: true };
  });

export const setBoard = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ postId: z.number().int(), boardId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await setPostBoard(adminOps(context), data.postId, data.boardId);
    return { ok: true };
  });

// ---- workspaces ----

export const myWorkspaces = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    if (!context.user) return [];
    const db = createDb();
    return db
      .select({ id: workspace.id, name: workspace.name, role: membership.role })
      .from(membership)
      .innerJoin(workspace, eq(workspace.id, membership.workspaceId))
      .where(eq(membership.userId, context.user.id))
      .orderBy(membership.createdAt);
  });


export const checkSlug = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ slug: z.string().trim().min(1).max(32) }).parse(d))
  .handler(async ({ data }) => {
    const id = slugify(data.slug);
    if (!id || id.length < 5 || RESERVED_SLUGS.includes(id)) {
      return { available: false, slug: id, suggestion: null };
    }
    const db = createDb();
    const [taken] = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, id)).limit(1);
    if (!taken) return { available: true, slug: id, suggestion: null };
    for (let i = 2; i <= 20; i++) {
      const candidate = `${id}-${i}`.slice(0, 32);
      const [exists] = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, candidate)).limit(1);
      if (!exists && !RESERVED_SLUGS.includes(candidate)) {
        return { available: false, slug: id, suggestion: candidate };
      }
    }
    return { available: false, slug: id, suggestion: null };
  });

export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ name: z.string().trim().min(2).max(60), slug: z.string().trim().min(2).max(32).optional(), website: z.string().trim().url().max(200).optional().or(z.literal("")), heardAboutUs: z.string().trim().max(100).optional().or(z.literal("")), whoCanPost: z.enum(["anyone", "members"]).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const u = requireUser(context.user);
    assertNotDemo(context.workspace);
    // The workspace guard is not enough on its own: the demo cookie also
    // reaches the apex host, where the workspace resolves to default.
    assertNotDemoIdentity(u);
    return createWorkspaceOp(createDb(), u, data);
  });

// Roadmap admin: all non-merged posts in roadmap statuses, grouped by status.
export const listRoadmapAdmin = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ sort: z.enum(["top", "new"]).default("top"), board: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const db = createDb();
    const wsId = context.workspace.id;
    const roadmapKeys = db.select({ key: status.key }).from(status).where(and(eq(status.workspaceId, wsId), eq(status.onRoadmap, true)));
    const rows = await db.query.post.findMany({
      where: and(
        eq(post.workspaceId, wsId),
        sql`${post.mergedIntoId} is null`,
        inArray(post.status, roadmapKeys),
        data.board ? eq(post.boardId, data.board) : undefined,
      ),
      orderBy: data.sort === "new" ? [desc(post.createdAt)] : [desc(post.voteCount)],
      limit: 200,
      with: { board: { columns: { id: true, name: true } } },
      columns: { id: true, title: true, status: true, boardId: true, voteCount: true, commentCount: true, pinned: true },
    });
    return rows;
  });
