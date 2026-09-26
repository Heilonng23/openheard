import { board, createDb, helpArticle, membership, post, status, tag, workspace } from "@openheard/db";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, count, eq } from "drizzle-orm";

import { getCached, setCached } from "@/lib/kv-cache";
import { rootDomain, sessionMiddleware } from "@/lib/session";
import type { listStatuses } from "@/lib/status-db";

type WorkspaceCache = {
  boards: { id: string; name: string; description: string | null; count: number }[];
  tags: (typeof tag.$inferSelect)[];
  statuses: Awaited<ReturnType<typeof listStatuses>>;
  statusCounts: Record<string, number>;
  total: number;
  // Published help articles; the header links to /help once there is one.
  helpArticles: number;
};

async function fetchWorkspaceData(wsId: string): Promise<WorkspaceCache> {
  const cached = await getCached<WorkspaceCache>(`workspace:${wsId}`);
  if (cached) return cached;

  const db = createDb();
  const [boards, tags, statuses, statusRows, helpRows] = await db.batch([
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
    db.select({ count: count() }).from(helpArticle).where(and(eq(helpArticle.workspaceId, wsId), eq(helpArticle.status, "published"))),
  ] as const);
  const statusCounts = Object.fromEntries(statusRows.map((r) => [r.status, r.count])) as Record<string, number>;
  const total = statusRows.reduce((n, r) => n + r.count, 0);

  const data: WorkspaceCache = { boards, tags, statuses, statusCounts, total, helpArticles: helpRows[0]?.count ?? 0 };
  void setCached(`workspace:${wsId}`, data);
  return data;
}

// Everything the shell needs on every page: workspace, boards with counts,
// tags, status counts, and who is looking.
async function googleSignIn() {
  const { env } = await import("@openheard/env/server");
  return !!(env as unknown as { GOOGLE_CLIENT_ID?: string }).GOOGLE_CLIENT_ID;
}

// Share image for link previews; empty keeps the openheard one.
async function ogImage() {
  const { env } = await import("@openheard/env/server");
  return (env as unknown as { OG_IMAGE_URL?: string }).OG_IMAGE_URL || null;
}

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const ws = context.workspace;

    if (context.marketing) {
      const ownWorkspaces = context.user
        ? await createDb()
            .select({ id: workspace.id, name: workspace.name })
            .from(membership)
            .innerJoin(workspace, eq(workspace.id, membership.workspaceId))
            .where(eq(membership.userId, context.user.id))
            .orderBy(membership.createdAt)
            .then((rows: { id: string; name: string }[]) => rows.filter((r) => r.id !== "default"))
        : [];
      return {
        workspace: ws,
        rootDomain: await rootDomain(),
        marketing: true as const,
        boards: [] as WorkspaceCache["boards"],
        tags: [] as WorkspaceCache["tags"],
        statuses: [] as WorkspaceCache["statuses"],
        statusCounts: {} as Record<string, number>,
        total: 0,
        helpArticles: 0,
        user: context.user,
        ownWorkspaces,
        googleSignIn: await googleSignIn(),
        ogImage: await ogImage(),
      };
    }

    const data = await fetchWorkspaceData(ws.id);
    return {
      workspace: ws,
      rootDomain: await rootDomain(),
      marketing: context.marketing,
      ...data,
      user: context.user,
      googleSignIn: await googleSignIn(),
      ogImage: await ogImage(),
    };
  });
