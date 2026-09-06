import { createFileRoute } from "@tanstack/react-router";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiKey, apiErrorResponse } from "@/lib/api-auth";
import {
  queryListPosts,
  queryGetPost,
  mutateCreatePost,
  mutateSetStatus,
  mutateAddComment,
  queryStatuses,
  queryBoards,
  queryChangelog,
  mutateDraftChangelog,
  mutatePublishChangelog,
} from "@/lib/api-actions";
import { z } from "zod";

function createMcpServer(workspaceId: string, db: Parameters<typeof queryListPosts>[0]) {
  const server = new McpServer({
    name: "openheard",
    version: "0.1.0",
  });

  server.tool(
    "list_posts",
    "List feedback posts. Filter by status, board, search query. Sort by top (most votes), new (newest), or trending.",
    {
      status: z.string().optional().describe("Filter by status key (e.g. open, planned, progress, done)"),
      board: z.string().optional().describe("Filter by board ID"),
      q: z.string().optional().describe("Search posts by title/body"),
      sort: z.enum(["top", "new", "trending"]).optional().describe("Sort order (default: trending)"),
      limit: z.number().optional().describe("Max results 1-100 (default: 30)"),
    },
    async ({ status, board, q, sort, limit }) => {
      const result = await queryListPosts(db, workspaceId, { status, board, q, sort, limit });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "get_post",
    "Get a single post with its comments and status history.",
    {
      id: z.number().describe("Post ID"),
    },
    async ({ id }) => {
      const result = await queryGetPost(db, workspaceId, id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "create_post",
    "Create a new feedback post. Requires a title (4-140 chars) and a board ID. Optionally set body text and author email.",
    {
      title: z.string().describe("Post title (4-140 characters)"),
      board: z.string().describe("Board ID to post to (use list_boards to find valid IDs)"),
      body: z.string().optional().describe("Post body (max 5000 chars)"),
      author_email: z.string().optional().describe("Email of the post author (matches existing user if found)"),
    },
    async ({ title, board, body, author_email }) => {
      const result = await mutateCreatePost(db, workspaceId, { title, body, boardId: board, authorEmail: author_email });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "set_status",
    "Change a post's status. Use a status key (e.g. open, review, planned, progress, done, closed) or the label text.",
    {
      post_id: z.number().describe("Post ID"),
      status: z.string().describe("Status key or label"),
    },
    async ({ post_id, status }) => {
      const result = await mutateSetStatus(db, workspaceId, post_id, status);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "add_comment",
    "Add a public comment to a post.",
    {
      post_id: z.number().describe("Post ID"),
      body: z.string().describe("Comment text (1-5000 chars)"),
    },
    async ({ post_id, body }) => {
      const result = await mutateAddComment(db, workspaceId, post_id, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "list_statuses",
    "List all available statuses for this workspace with their keys, labels, colors, and kinds.",
    {},
    async () => {
      const result = await queryStatuses(db, workspaceId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "list_boards",
    "List all boards in this workspace.",
    {},
    async () => {
      const result = await queryBoards(db, workspaceId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "list_changelog",
    "List published changelog entries with linked posts.",
    {},
    async () => {
      const result = await queryChangelog(db, workspaceId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "draft_changelog",
    "Create a draft changelog entry. Link post IDs to show which feedback was addressed. Use publish_changelog to make it public.",
    {
      title: z.string().describe("Entry title (3-140 chars)"),
      body: z.string().optional().describe("Markdown body (max 20000 chars)"),
      version: z.string().optional().describe("Version label (e.g. v1.2.0)"),
      post_ids: z.array(z.number()).optional().describe("Post IDs addressed by this release"),
    },
    async ({ title, body, version, post_ids }) => {
      const result = await mutateDraftChangelog(db, workspaceId, { title, body, version, postIds: post_ids });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "publish_changelog",
    "Publish a draft changelog entry. Linked posts are automatically moved to the 'done' status.",
    {
      id: z.number().describe("Changelog entry ID"),
    },
    async ({ id }) => {
      const result = await mutatePublishChangelog(db, workspaceId, id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  );

  return server;
}

async function handleMcp(request: Request): Promise<Response> {
  try {
    const ctx = await authenticateApiKey(request);
    const server = createMcpServer(ctx.workspaceId, ctx.db);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);
    const response = await transport.handleRequest(request);
    return response;
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      GET: ({ request }) => handleMcp(request),
      POST: ({ request }) => handleMcp(request),
      DELETE: ({ request }) => handleMcp(request),
    },
  },
});
