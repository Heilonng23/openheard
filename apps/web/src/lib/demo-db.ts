// Creating and wiping the demo workspace. Server only: it pulls the schema in.
import type { Db } from "@openheard/db";
import * as schema from "@openheard/db/schema/index";
import { hashPassword } from "better-auth/crypto";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_ID, DEMO_WORKSPACE_ID } from "./demo";
import { SEED_PEOPLE, seedDemoContent, seedUserId } from "./demo-seed";

const DEMO_ADMIN_NAME = "Demo admin";

// The settings a visitor is free to change, and what a reset puts back.
const DEMO_WORKSPACE_DEFAULTS = {
  name: "Acme",
  tagline: "A live demo board. Vote, comment, open the dashboard. It resets every night.",
  theme: "dark",
  accent: null,
  logoUrl: null,
  website: null,
  poweredBy: true,
  requireApproval: false,
  whoCanPost: "anyone" as const,
  anonymousVoting: true,
  showRoadmap: true,
  showChangelog: true,
};

// The demo admin signs in with a password nobody types: it is derived from the
// install's auth secret, so it is stable across resets and unguessable without
// the secret. The /demo route is the only thing that ever knows it.
export async function demoAdminPassword(): Promise<string> {
  let secret = "";
  try {
    const { env } = await import("@openheard/env/server");
    secret = (env as unknown as { BETTER_AUTH_SECRET?: string }).BETTER_AUTH_SECRET ?? "";
  } catch {
    // Standalone scripts have no Worker bindings, only the environment.
  }
  secret ||= process.env.BETTER_AUTH_SECRET ?? "";
  // Fail closed: an empty secret would give every install the same password.
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required to run the demo workspace");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${DEMO_ADMIN_ID}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// A `demo` workspace this code did not provision belongs to somebody. The
// shared admin's membership is the marker, and ordinary membership APIs refuse
// to hand that account out, so nothing else can forge it.
async function assertOursIfItExists(db: Db) {
  const [existing] = await db.select({ id: schema.workspace.id }).from(schema.workspace).where(eq(schema.workspace.id, DEMO_WORKSPACE_ID)).limit(1);
  if (!existing) return false;
  const [marker] = await db
    .select({ userId: schema.membership.userId })
    .from(schema.membership)
    .where(and(eq(schema.membership.workspaceId, DEMO_WORKSPACE_ID), eq(schema.membership.userId, DEMO_ADMIN_ID)))
    .limit(1);
  if (!marker) throw new Error(`A workspace named ${DEMO_WORKSPACE_ID} already exists and needs an explicit migration`);
  return true;
}

// Idempotent: the workspace, its statuses, and the shared admin account.
export async function ensureDemoWorkspace(db: Db) {
  const existed = await assertOursIfItExists(db);
  if (!existed) {
    await db.insert(schema.workspace).values({ id: DEMO_WORKSPACE_ID, ...DEMO_WORKSPACE_DEFAULTS }).onConflictDoNothing();
  }
  // Inlined rather than via lib/status-db, which pulls the Worker bindings in
  // and so cannot be imported by the standalone reset script.
  await db
    .insert(schema.status)
    .values(schema.DEFAULT_STATUSES.map((d, i) => ({ workspaceId: DEMO_WORKSPACE_ID, ...d, position: i })))
    .onConflictDoNothing();

  await db
    .insert(schema.user)
    .values({ id: DEMO_ADMIN_ID, name: DEMO_ADMIN_NAME, email: DEMO_ADMIN_EMAIL, emailVerified: true, role: "member" })
    .onConflictDoUpdate({ target: schema.user.id, set: { name: DEMO_ADMIN_NAME } });
  // Email and password, so the route can sign in through better-auth's own
  // public API rather than minting a session by hand. "local:credential" is
  // better-auth's issuer for its built-in email provider. Hashing is slow, so
  // it happens once at provisioning and never on the entry path.
  const [credential] = await db.select({ id: schema.account.id }).from(schema.account).where(eq(schema.account.id, `${DEMO_ADMIN_ID}-credential`)).limit(1);
  if (!credential) {
    await db
      .insert(schema.account)
      .values({
        id: `${DEMO_ADMIN_ID}-credential`,
        issuer: "local:credential",
        accountId: DEMO_ADMIN_ID,
        providerId: "credential",
        userId: DEMO_ADMIN_ID,
        password: await hashPassword(await demoAdminPassword()),
      })
      .onConflictDoNothing();
  }
  // Admin of the demo only. Every other workspace still sees a guest.
  await db.insert(schema.membership).values({ workspaceId: DEMO_WORKSPACE_ID, userId: DEMO_ADMIN_ID, role: "admin" }).onConflictDoNothing();
}

// Everything a public visitor needs on a deployment that has never run the
// cron: the workspace, the shared admin, and a board with something on it.
// Idempotent, and cheap once seeded (one counting query).
export async function ensureDemoContent(db: Db) {
  await ensureDemoWorkspace(db);
  const [seeded] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.post)
    .where(eq(schema.post.workspaceId, DEMO_WORKSPACE_ID));
  if (seeded && seeded.n > 0) return null;
  return seedDemoContent(db, DEMO_WORKSPACE_ID, DEMO_ADMIN_ID);
}

// Rewrites the stored password hash, for after the auth secret rotates. Kept
// off the per-request path deliberately.
export async function repairDemoCredential(db: Db) {
  const password = await hashPassword(await demoAdminPassword());
  await db.update(schema.account).set({ password }).where(eq(schema.account.id, `${DEMO_ADMIN_ID}-credential`));
}

// Deleting a demo row cascades into whatever points at it, and the foreign keys
// do not care about workspaces. Refuse to start rather than take a paying
// workspace's rows with us.
async function assertNoCrossWorkspaceRefs(db: Db) {
  const ws = DEMO_WORKSPACE_ID;
  const crossed = await db.all(sql`
    SELECT 1 AS bad FROM post p JOIN board b ON b.id = p.board_id
      WHERE b.workspace_id = ${ws} AND p.workspace_id <> ${ws}
    UNION ALL
    SELECT 1 FROM post_tag pt JOIN tag t ON t.id = pt.tag_id
      JOIN post p ON p.id = pt.post_id
      WHERE t.workspace_id = ${ws} AND p.workspace_id <> ${ws}
    UNION ALL
    SELECT 1 FROM changelog_post cp JOIN changelog_entry e ON e.id = cp.entry_id
      JOIN post p ON p.id = cp.post_id
      WHERE (p.workspace_id = ${ws}) <> (e.workspace_id = ${ws})
    LIMIT 1
  `);
  if (crossed.length) throw new Error("Repair cross-workspace references before resetting the demo");
}

// Everything a visitor could have created, then the seed again. Deletes run
// child-first: local SQLite does not enforce the foreign keys that D1 does.
// Nothing global is deleted. The seeded people are ordinary accounts and
// another workspace may legitimately point at them, so they are restored in
// place; the workspace row itself stays for the same reason.
export async function resetDemoWorkspace(db: Db, workspaceId: string = DEMO_WORKSPACE_ID) {
  if (workspaceId !== DEMO_WORKSPACE_ID) throw new Error("Only the demo workspace can be reset");
  const ws = DEMO_WORKSPACE_ID;
  await assertOursIfItExists(db);
  await assertNoCrossWorkspaceRefs(db);

  const posts = db.select({ id: schema.post.id }).from(schema.post).where(eq(schema.post.workspaceId, ws));
  const comments = db.select({ id: schema.comment.id }).from(schema.comment).where(inArray(schema.comment.postId, posts));
  const entries = db.select({ id: schema.changelogEntry.id }).from(schema.changelogEntry).where(eq(schema.changelogEntry.workspaceId, ws));

  const articles = db.select({ id: schema.helpArticle.id }).from(schema.helpArticle).where(eq(schema.helpArticle.workspaceId, ws));

  await db.delete(schema.helpArticleFeedback).where(inArray(schema.helpArticleFeedback.articleId, articles));
  await db.delete(schema.helpArticle).where(eq(schema.helpArticle.workspaceId, ws));
  await db.delete(schema.helpCollection).where(eq(schema.helpCollection.workspaceId, ws));
  await db.delete(schema.changelogPost).where(inArray(schema.changelogPost.entryId, entries));
  await db.delete(schema.changelogEntry).where(eq(schema.changelogEntry.workspaceId, ws));
  await db.delete(schema.commentReaction).where(inArray(schema.commentReaction.commentId, comments));
  await db.delete(schema.comment).where(inArray(schema.comment.postId, posts));
  await db.delete(schema.activity).where(inArray(schema.activity.postId, posts));
  await db.delete(schema.vote).where(inArray(schema.vote.postId, posts));
  await db.delete(schema.anonymousVote).where(inArray(schema.anonymousVote.postId, posts));
  await db.delete(schema.postTag).where(inArray(schema.postTag.postId, posts));
  await db.delete(schema.post).where(eq(schema.post.workspaceId, ws));
  await db.delete(schema.tag).where(eq(schema.tag.workspaceId, ws));
  await db.delete(schema.board).where(eq(schema.board.workspaceId, ws));
  await db.delete(schema.apiKey).where(eq(schema.apiKey.workspaceId, ws));
  await db.delete(schema.invite).where(eq(schema.invite.workspaceId, ws));
  await db.delete(schema.membership).where(and(eq(schema.membership.workspaceId, ws), ne(schema.membership.userId, DEMO_ADMIN_ID)));
  await db.delete(schema.status).where(eq(schema.status.workspaceId, ws));
  await db.update(schema.workspace).set(DEMO_WORKSPACE_DEFAULTS).where(eq(schema.workspace.id, ws));
  for (const [name, handle] of SEED_PEOPLE) {
    await db.update(schema.user).set({ name }).where(eq(schema.user.id, seedUserId(ws, handle)));
  }

  await ensureDemoWorkspace(db);
  return seedDemoContent(db, ws, DEMO_ADMIN_ID);
}
