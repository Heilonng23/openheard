import { DEFAULT_STATUSES, status } from "@openheard/db";
import type { Db } from "@openheard/db";
import type { STATUS_KINDS } from "@openheard/db/schema/feedback";
import { and, asc, eq } from "drizzle-orm";

// Server-only helpers. Never import this from a route or component; it pulls
// the database into the bundle. Server functions import it inside handlers.
export type StatusRow = typeof status.$inferSelect;

export async function listStatuses(db: Db, workspaceId: string) {
  return db.select().from(status).where(eq(status.workspaceId, workspaceId)).orderBy(asc(status.position));
}

export async function seedStatuses(db: Db, workspaceId: string) {
  await db
    .insert(status)
    .values(DEFAULT_STATUSES.map((d, i) => ({ workspaceId, ...d, position: i })))
    .onConflictDoNothing();
}

// The status a workspace uses for a given meaning, e.g. the first "done" one.
export async function statusOfKind(db: Db, workspaceId: string, kind: (typeof STATUS_KINDS)[number]) {
  const [row] = await db.select().from(status).where(and(eq(status.workspaceId, workspaceId), eq(status.kind, kind))).orderBy(asc(status.position)).limit(1);
  return row ?? null;
}

export async function assertStatus(db: Db, workspaceId: string, key: string) {
  const [row] = await db.select({ key: status.key }).from(status).where(and(eq(status.workspaceId, workspaceId), eq(status.key, key))).limit(1);
  if (!row) throw new Error("Unknown status");
}

