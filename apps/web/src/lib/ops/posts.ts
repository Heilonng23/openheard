import { activity, attachment, board, changelogPost, comment, post, postTag, tag, vote } from "@openheard/db";
import { and, desc, eq, inArray, like, notInArray, or, sql } from "drizzle-orm";

import { claimQuery, reserveAttachments } from "@/lib/attachment-db";
import { AttachmentGoneError } from "@/lib/attachment-db";
import { notifyIntegrations } from "@/lib/integration-db";
import { buildStatusEmails, deliver, inBackground } from "@/lib/notify";
import { listStatuses, statusOfKind } from "@/lib/status-db";

import { type OpCtx, OpError, listOf, needActor, refresh } from "./context";

function escapeLike(s: string) {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

// Every post write proves the post is in this workspace first.
export async function ownPost(ctx: OpCtx, postId: number) {
  const [row] = await ctx.db
    .select({ id: post.id, title: post.title, status: post.status, pinned: post.pinned, mergedIntoId: post.mergedIntoId })
    .from(post)
    .where(and(eq(post.id, postId), eq(post.workspaceId, ctx.workspace.id)))
    .limit(1);
  if (!row) throw new OpError(`Post ${postId} not found in workspace '${ctx.workspace.id}'`, 404);
  return row;
}

// A status by key, or by its label for people who type what they see.
export async function resolveStatus(ctx: OpCtx, keyOrLabel: string) {
  const all = await listStatuses(ctx.db, ctx.workspace.id);
  const want = keyOrLabel.trim().toLowerCase();
  const hit = all.find((s) => s.key === keyOrLabel) ?? all.find((s) => s.key.toLowerCase() === want || s.label.toLowerCase() === want);
  if (!hit) throw new OpError(`Status '${keyOrLabel}' not found; statuses are: ${listOf(all.map((s) => s.key))}`);
  return hit;
}

// A board by id or name.
export async function resolveBoard(ctx: OpCtx, idOrName: string) {
  const all = await ctx.db.select({ id: board.id, name: board.name }).from(board).where(eq(board.workspaceId, ctx.workspace.id));
  const want = idOrName.trim().toLowerCase();
  const hit = all.find((b) => b.id === idOrName) ?? all.find((b) => b.id.toLowerCase() === want || b.name.toLowerCase() === want);
  if (!hit) throw new OpError(`Board '${idOrName}' not found; boards are: ${listOf(all.map((b) => `${b.id} (${b.name})`))}`);
  return hit;
}

// Tags by id or name. Unknown ones are an error unless `create` is set.
export async function resolveTags(ctx: OpCtx, names: string[], opts: { create?: (name: string) => Promise<string> } = {}) {
  if (!names.length) return [];
  const all = await ctx.db.select({ id: tag.id, name: tag.name }).from(tag).where(eq(tag.workspaceId, ctx.workspace.id));
  const ids: string[] = [];
  for (const n of names) {
    const want = n.trim().toLowerCase();
    const hit = all.find((t) => t.id === n || t.name.toLowerCase() === want);
    if (hit) ids.push(hit.id);
    else if (opts.create) ids.push(await opts.create(n.trim()));
    else throw new OpError(`Tag '${n}' not found; tags are: ${listOf(all.map((t) => t.name))}`);
  }
  return [...new Set(ids)];
}

// Drops any tag id that does not belong to this workspace.
export async function ownTags(ctx: OpCtx, tagIds: string[]): Promise<string[]> {
  if (!tagIds.length) return [];
  const rows = await ctx.db.select({ id: tag.id }).from(tag).where(and(inArray(tag.id, tagIds), eq(tag.workspaceId, ctx.workspace.id)));
  return rows.map((r) => r.id);
}

export async function setPostStatus(ctx: OpCtx, postId: number, statusKey: string, note?: string) {
  const { db, workspace: ws } = ctx;
  const current = await ownPost(ctx, postId);
  const target = await resolveStatus(ctx, statusKey);
  if (current.status === target.key) return { changed: false, status: target.key };
  // Conditional on the status just read, so two requests at once move it (and email) once.
  const moved = await db.update(post).set({ status: target.key, statusChangedAt: new Date() }).where(and(eq(post.id, postId), eq(post.status, current.status))).returning({ id: post.id });
  if (!moved.length) return { changed: false, status: target.key };
  await db.insert(activity).values({ postId, actorId: ctx.actor?.id ?? null, type: "status", fromStatus: current.status, toStatus: target.key, note: note || null });
  refresh(ctx, [postId]);
  notifyIntegrations(db, ws.id, { type: "post.status_changed", postId, fromStatus: current.status }, ctx.origin);
  const actor = ctx.actor;
  if (actor) {
    await inBackground("status-email", async () => {
      const statuses = await listStatuses(db, ws.id);
      const label = (key: string) => {
        const s = statuses.find((x) => x.key === key);
        return { label: s?.label ?? key, color: s?.color ?? "#999999" };
      };
      const change = { postId, postTitle: current.title, from: label(current.status), to: label(target.key), note };
      await deliver(await buildStatusEmails({ db, workspace: ws, origin: ctx.origin, actor, change }), undefined, "status-email");
    });
  }
  return { changed: true, status: target.key };
}

// `pinned` undefined flips it, as the dashboard button does.
export async function setPinned(ctx: OpCtx, postId: number, pinned?: boolean) {
  const current = await ownPost(ctx, postId);
  const next = pinned ?? !current.pinned;
  if (next === current.pinned) return { pinned: next };
  await ctx.db.update(post).set({ pinned: next }).where(eq(post.id, postId));
  await ctx.db.insert(activity).values({ postId, actorId: ctx.actor?.id ?? null, type: "pin", note: next ? "pinned" : "unpinned" });
  refresh(ctx, [postId]);
  return { pinned: next };
}

// Merge `from` into `into`: votes are summed (one per user), comments move,
// the merged post keeps a pointer so its old URL still resolves.
export async function mergePosts(ctx: OpCtx, from: number, into: number) {
  const { db } = ctx;
  if (from === into) throw new OpError("Pick a different post");
  const source = await ownPost(ctx, from);
  const target = await ownPost(ctx, into);
  if (source.mergedIntoId === into) return { into, alreadyMerged: true, votesAdded: 0 };
  if (target.mergedIntoId) throw new OpError(`Post ${into} was itself merged into ${target.mergedIntoId}; merge into that one`);
  const fromVotes = await db.select({ userId: vote.userId }).from(vote).where(eq(vote.postId, from));
  const intoVotes = new Set((await db.select({ userId: vote.userId }).from(vote).where(eq(vote.postId, into))).map((v) => v.userId));
  const moved = fromVotes.filter((v) => !intoVotes.has(v.userId));
  // One statement copies the votes, so a popular post does not run into the
  // limit on bound values a multi-row insert would hit.
  if (moved.length) {
    const alreadyVoted = db.select({ userId: vote.userId }).from(vote).where(eq(vote.postId, into));
    await db
      .insert(vote)
      .select(db.select({ postId: sql`${into}`.as("post_id"), userId: vote.userId, createdAt: vote.createdAt }).from(vote).where(and(eq(vote.postId, from), notInArray(vote.userId, alreadyVoted))))
      .onConflictDoNothing();
  }
  await db.update(comment).set({ postId: into }).where(eq(comment.postId, from));
  const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(comment).where(and(eq(comment.postId, into), eq(comment.internal, false)));
  await db.update(post).set({ voteCount: sql`${post.voteCount} + ${moved.length}`, commentCount: c }).where(eq(post.id, into));
  const closed = await statusOfKind(db, ctx.workspace.id, "closed");
  await db.update(post).set({ mergedIntoId: into, status: closed?.key ?? "closed" }).where(eq(post.id, from));
  const actorId = ctx.actor?.id ?? null;
  await db.insert(activity).values([
    { postId: into, actorId, type: "merge", note: `merged "${source.title}" into this, +${moved.length} votes` },
    { postId: from, actorId, type: "merge", note: `merged into "${target.title}"` },
  ]);
  refresh(ctx, [from, into]);
  return { into, alreadyMerged: false, votesAdded: moved.length };
}

export async function setPostTags(ctx: OpCtx, postId: number, tagIds: string[]) {
  await ownPost(ctx, postId);
  const ids = await ownTags(ctx, tagIds);
  await ctx.db.delete(postTag).where(eq(postTag.postId, postId));
  if (ids.length) await ctx.db.insert(postTag).values(ids.map((tagId) => ({ postId, tagId })));
  refresh(ctx, [postId]);
  return { tags: ids };
}

export async function setPostEta(ctx: OpCtx, postId: number, eta: string | null) {
  await ownPost(ctx, postId);
  await ctx.db.update(post).set({ eta: eta?.trim() || null }).where(eq(post.id, postId));
  refresh(ctx, [postId]);
  return { eta: eta?.trim() || null };
}

export async function setPostBoard(ctx: OpCtx, postId: number, boardIdOrName: string) {
  await ownPost(ctx, postId);
  // Board ids are global, so a post could otherwise be parked on another
  // workspace's board and be deleted along with it.
  const b = await resolveBoard(ctx, boardIdOrName);
  await ctx.db.update(post).set({ boardId: b.id }).where(eq(post.id, postId));
  refresh(ctx, [postId]);
  return { boardId: b.id };
}

export async function setPostText(ctx: OpCtx, postId: number, data: { title?: string; body?: string }) {
  await ownPost(ctx, postId);
  const set: { title?: string; body?: string } = {};
  if (data.title !== undefined) {
    const title = data.title.trim();
    if (title.length < 4 || title.length > 140) throw new OpError("Title must be 4 to 140 characters");
    set.title = title;
  }
  if (data.body !== undefined) {
    if (data.body.length > 5000) throw new OpError("Body is at most 5000 characters");
    set.body = data.body.trim();
  }
  if (Object.keys(set).length) {
    await ctx.db.update(post).set(set).where(eq(post.id, postId));
    refresh(ctx, [postId]);
  }
  return { ok: true };
}

// Deletes a post with its votes and comments. Its images lose their owner and
// go with the nightly sweep of unclaimed uploads.
export async function deletePost(ctx: OpCtx, postId: number) {
  const { db } = ctx;
  await ownPost(ctx, postId);
  const comments = db.select({ id: comment.id }).from(comment).where(eq(comment.postId, postId));
  await db.batch([
    db.update(attachment).set({ postId: null, commentId: null }).where(or(eq(attachment.postId, postId), inArray(attachment.commentId, comments))),
    // Posts merged into this one point back at their own pages again.
    db.update(post).set({ mergedIntoId: null }).where(eq(post.mergedIntoId, postId)),
    db.delete(changelogPost).where(eq(changelogPost.postId, postId)),
    db.delete(post).where(eq(post.id, postId)),
  ] as unknown as Parameters<typeof db.batch>[0]);
  refresh(ctx, [postId]);
  return { deleted: postId };
}

// A vote by `userId`. `want` undefined flips it, as the vote button does.
export async function setVote(ctx: OpCtx, postId: number, userId: string, want?: boolean) {
  const { db } = ctx;
  await ownPost(ctx, postId);
  const [existing] = await db.select({ userId: vote.userId }).from(vote).where(and(eq(vote.postId, postId), eq(vote.userId, userId)));
  const next = want ?? !existing;
  if (next === !!existing) return { voted: next };
  if (next) {
    await db.insert(vote).values({ postId, userId });
    await db.update(post).set({ voteCount: sql`${post.voteCount} + 1` }).where(eq(post.id, postId));
  } else {
    await db.delete(vote).where(and(eq(vote.postId, postId), eq(vote.userId, userId)));
    await db.update(post).set({ voteCount: sql`max(${post.voteCount} - 1, 0)` }).where(eq(post.id, postId));
  }
  void refresh(ctx, [postId]);
  return { voted: next };
}

// A comment or internal note by the actor (or no one, for ownerless keys).
// Images must be the author's own unclaimed uploads.
export async function addComment(ctx: OpCtx, data: { postId: number; body: string; internal: boolean; attachments?: string[] }) {
  const { db } = ctx;
  const body = data.body.trim();
  const attachments = data.attachments ?? [];
  if (!body && !attachments.length) throw new OpError("Write something or attach an image");
  if (body.length > 5000) throw new OpError("Comment too long (max 5000 characters)");
  await ownPost(ctx, data.postId);
  const authorId = ctx.actor?.id ?? null;
  const countUp = data.internal ? [] : [db.update(post).set({ commentCount: sql`${post.commentCount} + 1` }).where(eq(post.id, data.postId))];
  let id: number;
  if (!attachments.length) {
    const [[created]] = (await db.batch([db.insert(comment).values({ postId: data.postId, authorId, body, internal: data.internal }).returning({ id: comment.id }), ...countUp] as unknown as Parameters<typeof db.batch>[0])) as unknown as [{ id: number }[]];
    id = created!.id;
  } else {
    const u = needActor(ctx, "Attaching images");
    const owner = { workspaceId: ctx.workspace.id, uploaderId: u.id };
    const images = await reserveAttachments(db, attachments, owner);
    // One batch; the claim finds the comment as this author's newest.
    const newest = sql<number>`(select max(${comment.id}) from ${comment} where ${comment.authorId} = ${u.id})`;
    const steps = [db.insert(comment).values({ postId: data.postId, authorId: u.id, body, internal: data.internal }).returning({ id: comment.id }), claimQuery(db, images, owner, { commentId: newest }), ...countUp];
    const [[created], claimed] = (await db.batch(steps as unknown as Parameters<typeof db.batch>[0])) as unknown as [{ id: number }[], { id: string }[]];
    if (claimed.length !== images.length) {
      await db.batch([
        db.update(attachment).set({ commentId: null }).where(eq(attachment.commentId, created!.id)),
        db.delete(comment).where(eq(comment.id, created!.id)),
        ...(data.internal ? [] : [db.update(post).set({ commentCount: sql`max(${post.commentCount} - 1, 0)` }).where(eq(post.id, data.postId))]),
      ] as unknown as Parameters<typeof db.batch>[0]);
      throw new AttachmentGoneError();
    }
    id = created!.id;
  }
  if (!data.internal) {
    void refresh(ctx, [data.postId]);
    notifyIntegrations(db, ctx.workspace.id, { type: "comment.created", commentId: id }, ctx.origin);
  }
  return { id };
}

// Comments and internal notes, oldest first, as the team sees them.
export async function listComments(ctx: OpCtx, postId: number, opts: { internal?: boolean } = {}) {
  await ownPost(ctx, postId);
  const rows = await ctx.db.query.comment.findMany({
    where: and(eq(comment.postId, postId), opts.internal === false ? eq(comment.internal, false) : undefined),
    with: { author: { columns: { name: true } } },
    orderBy: [comment.createdAt],
  });
  return rows.map((c) => ({ id: c.id, body: c.body, internal: c.internal, author: c.author?.name ?? null, createdAt: c.createdAt }));
}

// Posts whose titles share words with `text`, most shared words then most
// votes first. The same matching the post page uses for merge candidates.
export async function similarPosts(ctx: OpCtx, text: string, opts: { excludeId?: number; limit?: number; minLength?: number } = {}) {
  const words = [...new Set(text.toLowerCase().match(new RegExp(`[a-z0-9]{${opts.minLength ?? 5},}`, "g")) ?? [])].slice(0, 6);
  if (!words.length) return [];
  const escaped = words.map(escapeLike);
  const hits = sql.join(escaped.map((w) => sql`(lower(${post.title}) like ${"%" + w + "%"} escape '\\')`), sql` + `);
  const rows = await ctx.db
    .select({ id: post.id, title: post.title, voteCount: post.voteCount, status: post.status, shared: sql<number>`${hits}` })
    .from(post)
    .where(
      and(
        eq(post.workspaceId, ctx.workspace.id),
        opts.excludeId ? sql`${post.id} != ${opts.excludeId}` : undefined,
        sql`${post.mergedIntoId} is null`,
        or(...escaped.map((w) => like(post.title, `%${w}%`))),
      ),
    )
    .orderBy(desc(hits), desc(post.voteCount))
    .limit(opts.limit ?? 3);
  return rows;
}
