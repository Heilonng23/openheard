// Creating and wiping the demo workspace. Server only: it pulls the schema in.
import type { Db } from "@openheard/db";
import * as schema from "@openheard/db/schema/index";
import { hashPassword } from "better-auth/crypto";
import { and, eq, inArray, like, ne } from "drizzle-orm";

import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_ID, DEMO_WORKSPACE_ID } from "./demo";
import { seedDemoContent } from "./demo-seed";

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
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${DEMO_ADMIN_ID}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Idempotent: the workspace, its statuses, and the shared admin account.
export async function ensureDemoWorkspace(db: Db) {
  await db
    .insert(schema.workspace)
    .values({
      id: DEMO_WORKSPACE_ID,
      name: "Acme",
      tagline: "A live demo board. Vote, comment, open the dashboard. It resets every night.",
      anonymousVoting: true,
    })
    .onConflictDoNothing();
  // Inlined rather than via lib/status-db, which pulls the Worker bindings in
  // and so cannot be imported by the standalone reset script.
  await db
    .insert(schema.status)
    .values(schema.DEFAULT_STATUSES.map((d, i) => ({ workspaceId: DEMO_WORKSPACE_ID, ...d, position: i })))
    .onConflictDoNothing();

  await db
    .insert(schema.user)
    .values({ id: DEMO_ADMIN_ID, name: "Demo admin", email: DEMO_ADMIN_EMAIL, emailVerified: true, role: "member" })
    .onConflictDoNothing();
  // Email and password, so the route can sign in through better-auth's own
  // public API rather than minting a session by hand. "local:credential" is
  // better-auth's issuer for its built-in email provider.
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
    .onConflictDoUpdate({ target: schema.account.id, set: { password: await hashPassword(await demoAdminPassword()) } });
  // Admin of the demo only. Every other workspace still sees a guest.
  await db
    .insert(schema.membership)
    .values({ workspaceId: DEMO_WORKSPACE_ID, userId: DEMO_ADMIN_ID, role: "admin" })
    .onConflictDoNothing();
}

// Everything a visitor could have created, then the seed again. Deletes run
// child-first: local SQLite does not enforce the foreign keys that D1 does.
export async function resetDemoWorkspace(db: Db, workspaceId: string = DEMO_WORKSPACE_ID) {
  if (workspaceId !== DEMO_WORKSPACE_ID) throw new Error("Only the demo workspace can be reset");
  const ws = DEMO_WORKSPACE_ID;
  const posts = db.select({ id: schema.post.id }).from(schema.post).where(eq(schema.post.workspaceId, ws));
  const comments = db.select({ id: schema.comment.id }).from(schema.comment).where(inArray(schema.comment.postId, posts));
  const entries = db.select({ id: schema.changelogEntry.id }).from(schema.changelogEntry).where(eq(schema.changelogEntry.workspaceId, ws));

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
  await db.delete(schema.user).where(like(schema.user.id, `${ws}-user-%`));
  await db.delete(schema.status).where(eq(schema.status.workspaceId, ws));
  await db.delete(schema.workspace).where(eq(schema.workspace.id, ws));

  await ensureDemoWorkspace(db);
  return seedDemoContent(db, ws, DEMO_ADMIN_ID);
}
