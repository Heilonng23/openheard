// Opting in and out of workspace emails. Server-only: pulls the database in.
// Server functions and the one-click route import it; never a component.
import { changelogSubscriber, createDb, emailOptout, workspace } from "@openheard/db";
import type { Db, EmailKind } from "@openheard/db";
import { env } from "@openheard/env/server";
import { and, eq, isNull } from "drizzle-orm";

import { verifyEmailToken } from "./email-token";

export const emailSecret = () => (env as unknown as { BETTER_AUTH_SECRET: string }).BETTER_AUTH_SECRET;

export async function optOut(db: Db, workspaceId: string, email: string, kind: EmailKind) {
  await db.insert(emailOptout).values({ workspaceId, email, kind }).onConflictDoNothing();
  if (kind === "changelog") await db.delete(changelogSubscriber).where(and(eq(changelogSubscriber.workspaceId, workspaceId), eq(changelogSubscriber.email, email)));
}

export async function optIn(db: Db, workspaceId: string, email: string, kind: EmailKind) {
  await db.delete(emailOptout).where(and(eq(emailOptout.workspaceId, workspaceId), eq(emailOptout.email, email), eq(emailOptout.kind, kind)));
  if (kind === "changelog") {
    await db
      .insert(changelogSubscriber)
      .values({ workspaceId, email, confirmedAt: new Date() })
      .onConflictDoUpdate({ target: [changelogSubscriber.workspaceId, changelogSubscriber.email], set: { confirmedAt: new Date() } });
  }
}

// A confirm link only completes a signup that is still waiting. After an
// unsubscribe the row is gone, so replaying an old link does nothing.
export async function confirmPending(db: Db, workspaceId: string, email: string): Promise<boolean> {
  const where = and(eq(changelogSubscriber.workspaceId, workspaceId), eq(changelogSubscriber.email, email));
  const claimed = await db.update(changelogSubscriber).set({ confirmedAt: new Date() }).where(and(where, isNull(changelogSubscriber.confirmedAt))).returning({ email: changelogSubscriber.email });
  if (claimed.length) {
    await db.delete(emailOptout).where(and(eq(emailOptout.workspaceId, workspaceId), eq(emailOptout.email, email), eq(emailOptout.kind, "changelog")));
    return true;
  }
  const [row] = await db.select({ email: changelogSubscriber.email }).from(changelogSubscriber).where(where);
  return Boolean(row);
}

export async function workspaceName(db: Db, id: string) {
  const [row] = await db.select({ name: workspace.name }).from(workspace).where(eq(workspace.id, id));
  return row?.name ?? null;
}

// Also answers the inbox's one-click unsubscribe (routes/api/unsubscribe.ts).
// Only ever opts out: the link never expires, so it must not opt anyone back in.
export async function applyUnsubscribe(raw: string) {
  const t = await verifyEmailToken(raw, emailSecret());
  if (!t || t.k === "confirm") return null;
  const db = createDb();
  const name = await workspaceName(db, t.w);
  if (!name) return null;
  await optOut(db, t.w, t.e, t.k);
  return { kind: t.k, workspaceName: name };
}
