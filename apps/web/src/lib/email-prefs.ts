// Opting in and out of workspace emails. Server-only: pulls the database in.
// Server functions and the one-click route import it; never a component.
import { changelogSubscriber, createDb, emailOptout, workspace } from "@openheard/db";
import type { Db, EmailKind } from "@openheard/db";
import { env } from "@openheard/env/server";
import { and, eq } from "drizzle-orm";

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

export async function workspaceName(db: Db, id: string) {
  const [row] = await db.select({ name: workspace.name }).from(workspace).where(eq(workspace.id, id));
  return row?.name ?? null;
}

// Also answers the inbox's one-click unsubscribe (routes/api/unsubscribe.ts).
export async function applyUnsubscribe(raw: string, undo = false) {
  const t = await verifyEmailToken(raw, emailSecret());
  if (!t || t.k === "confirm") return null;
  const db = createDb();
  const name = await workspaceName(db, t.w);
  if (!name) return null;
  await (undo ? optIn : optOut)(db, t.w, t.e, t.k);
  return { kind: t.k, workspaceName: name };
}

