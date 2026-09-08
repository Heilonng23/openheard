import { board, createDb, post, status, tag } from "@openheard/db";
import { createServerFn } from "@tanstack/react-start";
import { asc, count, eq } from "drizzle-orm";

import { getCached, setCached } from "@/lib/kv-cache";
import { rootDomain, sessionMiddleware } from "@/lib/session";
import type { listStatuses } from "@/lib/status-db";
import { env } from "@openheard/env/server";

type WorkspaceCache = {
  boards: { id: string; name: string; description: string | null; count: number }[];
  tags: (typeof tag.$inferSelect)[];
  statuses: Awaited<ReturnType<typeof listStatuses>>;
  statusCounts: Record<string, number>;
  total: number;
};

async function fetchWorkspaceData(wsId: string): Promise<WorkspaceCache> {
  const cached = await getCached<WorkspaceCache>(`workspace:${wsId}`);
  if (cached) return cached;

  const db = createDb();
  const [boards, tags, statuses, statusRows] = await db.batch([
    db
      .select({ id: board.id, name: board.name, description: board.description, count: count(post.id) })
      .from(board)
      .leftJoin(post, eq(post.boardId, board.id))
      .where(eq(board.workspaceId, wsId))
      .groupBy(board.id)
      .orderBy(asc(board.position)),
    db.select().from(tag).where(eq(tag.workspaceId, wsId)).orderBy(asc(tag.name)),
    db.select().from(status).where(eq(status.workspaceId, wsId)).orderBy(asc(status.position)),
    db.select({ status: post.status, count: count() }).from(post).where(eq(post.workspaceId, wsId)).groupBy(post.status),
  ] as const);
  const statusCounts = Object.fromEntries(statusRows.map((r) => [r.status, r.count])) as Record<string, number>;
  const total = statusRows.reduce((n, r) => n + r.count, 0);

  const data: WorkspaceCache = { boards, tags, statuses, statusCounts, total };
  void setCached(`workspace:${wsId}`, data);
  return data;
}

// Everything the shell needs on every page: workspace, boards with counts,
// tags, status counts, and who is looking.
export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const ws = context.workspace;

    if (context.marketing) {
      return {
        workspace: ws,
        rootDomain: await rootDomain(),
        marketing: true as const,
        boards: [] as WorkspaceCache["boards"],
        tags: [] as WorkspaceCache["tags"],
        statuses: [] as WorkspaceCache["statuses"],
        statusCounts: {} as Record<string, number>,
        total: 0,
        user: context.user,
        googleSignIn: !!(env as unknown as { GOOGLE_CLIENT_ID?: string }).GOOGLE_CLIENT_ID,
      };
    }

    const data = await fetchWorkspaceData(ws.id);
    return {
      workspace: ws,
      rootDomain: await rootDomain(),
      marketing: context.marketing,
      ...data,
      user: context.user,
      googleSignIn: !!(env as unknown as { GOOGLE_CLIENT_ID?: string }).GOOGLE_CLIENT_ID,
    };
  });
