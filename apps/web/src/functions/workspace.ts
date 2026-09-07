import { board, createDb, post, tag } from "@openheard/db";
import { createServerFn } from "@tanstack/react-start";
import { asc, count, eq } from "drizzle-orm";

import { rootDomain, sessionMiddleware } from "@/lib/session";
import { listStatuses } from "@/lib/status-db";
import { env } from "@openheard/env/server";

// Everything the shell needs on every page: workspace, boards with counts,
// tags, status counts, and who is looking.
export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const db = createDb();
    const ws = context.workspace;

    if (context.marketing) {
      return {
        workspace: ws,
        rootDomain: await rootDomain(),
        marketing: true as const,
        boards: [] as { id: string; name: string; description: string | null; count: number }[],
        tags: [] as (typeof tag.$inferSelect)[],
        statuses: [] as Awaited<ReturnType<typeof listStatuses>>,
        statusCounts: {} as Record<string, number>,
        total: 0,
        user: context.user,
        googleSignIn: !!(env as unknown as { GOOGLE_CLIENT_ID?: string }).GOOGLE_CLIENT_ID,
      };
    }

    const [boards, tags, statuses, statusRows] = await Promise.all([
      db
        .select({ id: board.id, name: board.name, description: board.description, count: count(post.id) })
        .from(board)
        .leftJoin(post, eq(post.boardId, board.id))
        .where(eq(board.workspaceId, ws.id))
        .groupBy(board.id)
        .orderBy(asc(board.position)),
      db.select().from(tag).where(eq(tag.workspaceId, ws.id)).orderBy(asc(tag.name)),
      listStatuses(db, ws.id),
      db.select({ status: post.status, count: count() }).from(post).where(eq(post.workspaceId, ws.id)).groupBy(post.status),
    ]);
    const statusCounts = Object.fromEntries(statusRows.map((r) => [r.status, r.count])) as Record<string, number>;
    const total = statusRows.reduce((n, r) => n + r.count, 0);
    return {
      workspace: ws,
      rootDomain: await rootDomain(),
      marketing: context.marketing,
      boards,
      tags,
      statuses,
      statusCounts,
      total,
      user: context.user,
      googleSignIn: !!(env as unknown as { GOOGLE_CLIENT_ID?: string }).GOOGLE_CLIENT_ID,
    };
  });
