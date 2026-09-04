import { board, createDb, post, tag, workspace } from "@openheard/db";
import { createServerFn } from "@tanstack/react-start";
import { asc, count, eq } from "drizzle-orm";

import { sessionMiddleware } from "@/lib/session";

// Everything the shell needs on every page: workspace, boards with counts,
// tags, status counts, and who is looking.
export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const db = createDb();
    const [ws] = await db.select().from(workspace).limit(1);
    const boards = await db
      .select({ id: board.id, name: board.name, description: board.description, count: count(post.id) })
      .from(board)
      .leftJoin(post, eq(post.boardId, board.id))
      .groupBy(board.id)
      .orderBy(asc(board.position));
    const tags = await db.select().from(tag).orderBy(asc(tag.name));
    const statusRows = await db.select({ status: post.status, count: count() }).from(post).groupBy(post.status);
    const statusCounts = Object.fromEntries(statusRows.map((r) => [r.status, r.count])) as Record<string, number>;
    const total = statusRows.reduce((n, r) => n + r.count, 0);
    return {
      workspace: ws ?? { id: "default", name: "openheard", tagline: "", theme: "dark", poweredBy: true, requireApproval: false },
      boards,
      tags,
      statusCounts,
      total,
      user: context.user,
    };
  });
