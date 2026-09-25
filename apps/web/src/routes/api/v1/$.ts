import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, apiJsonFor, apiErrorResponse, apiOps, ApiError } from "@/lib/api-auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
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
import { helpArticleBySlug, helpCenterIndex, searchHelpArticles } from "@/lib/help-db";

type RouteHandler = (request: Request, params: Record<string, string>) => Promise<Response>;

function parsePath(splat: string): string[] {
  return splat.split("/").filter(Boolean);
}

async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError(422, "Invalid JSON body");
  }
}

const getRoutes: RouteHandler = async (request, params) => {
  const api = await authenticateApiKey(request);
  const segments = parsePath(params._splat ?? "");
  const url = new URL(request.url);
  // The workspace's own address, so attachment links in a post resolve on
  // the host that serves that workspace's uploads.
  const ops = await apiOps(api, url.origin, url.searchParams.get("workspace"));
  const ctx = { db: ops.db, workspaceId: ops.workspace.id };
  const reply = (data: unknown, status?: number) => apiJsonFor(ops.workspace.id, data, status);

  if (segments[0] === "posts" && segments.length === 1) {
    const result = await queryListPosts(ctx.db, ctx.workspaceId, {
      board: url.searchParams.get("board") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      sort: (url.searchParams.get("sort") as "top" | "new" | "trending") ?? undefined,
      limit: url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.has("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    return reply(result);
  }

  if (segments[0] === "posts" && segments.length === 2) {
    const id = Number(segments[1]);
    if (!Number.isInteger(id)) throw new ApiError(422, "Invalid post ID");
    const result = await queryGetPost(ctx.db, ctx.workspaceId, id, ops.origin);
    return reply(result);
  }

  if (segments[0] === "statuses" && segments.length === 1) {
    const result = await queryStatuses(ctx.db, ctx.workspaceId);
    return reply({ statuses: result });
  }

  if (segments[0] === "boards" && segments.length === 1) {
    const result = await queryBoards(ctx.db, ctx.workspaceId);
    return reply({ boards: result });
  }

  if (segments[0] === "changelog" && segments.length === 1) {
    const result = await queryChangelog(ctx.db, ctx.workspaceId);
    return reply({ entries: result });
  }

  // Help center, published articles only.
  if (segments[0] === "help" && segments[1] === "collections" && segments.length === 2) {
    const { collections, uncategorised } = await helpCenterIndex(ctx.db, ctx.workspaceId);
    return reply({ collections, uncategorised });
  }

  if (segments[0] === "help" && segments[1] === "articles" && segments.length === 2) {
    const q = url.searchParams.get("q")?.trim() ?? "";
    if (!q) throw new ApiError(422, "Pass a search query as ?q=");
    const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : undefined;
    return reply({ articles: await searchHelpArticles(ctx.db, ctx.workspaceId, q.slice(0, 120), { limit }) });
  }

  if (segments[0] === "help" && segments[1] === "articles" && segments.length === 3) {
    const article = await helpArticleBySlug(ctx.db, ctx.workspaceId, segments[2]!);
    if (!article) throw new ApiError(404, "Article not found");
    return reply(article);
  }

  throw new ApiError(404, "Not found");
};

const postRoutes: RouteHandler = async (request, params) => {
  const ctx = await authenticateApiKey(request);
  const segments = parsePath(params._splat ?? "");
  const body = await parseJsonBody(request);
  const url = new URL(request.url);
  const ops = await apiOps(ctx, url.origin, url.searchParams.get("workspace"));
  const reply = (data: unknown, status?: number) => apiJsonFor(ops.workspace.id, data, status);

  if (segments[0] === "posts" && segments.length === 1) {
    const result = await mutateCreatePost(ops.db, ops.workspace.id, {
      title: body.title as string,
      body: body.body as string | undefined,
      boardId: body.board as string,
      authorEmail: body.author_email as string | undefined,
    }, ops.origin);
    return reply(result, 201);
  }

  if (segments[0] === "posts" && segments[2] === "status" && segments.length === 3) {
    const id = Number(segments[1]);
    if (!Number.isInteger(id)) throw new ApiError(422, "Invalid post ID");
    const result = await mutateSetStatus(ops, id, body.status as string, body.note as string | undefined);
    return reply(result);
  }

  if (segments[0] === "posts" && segments[2] === "comments" && segments.length === 3) {
    const id = Number(segments[1]);
    if (!Number.isInteger(id)) throw new ApiError(422, "Invalid post ID");
    const result = await mutateAddComment(ops, id, body.body as string);
    return reply(result, 201);
  }

  if (segments[0] === "changelog" && segments.length === 1) {
    const result = await mutateDraftChangelog(ops, {
      title: body.title as string,
      body: body.body as string | undefined,
      version: body.version as string | undefined,
      postIds: body.post_ids as number[] | undefined,
    });
    return reply(result, 201);
  }

  if (segments[0] === "changelog" && segments[2] === "publish" && segments.length === 3) {
    const id = Number(segments[1]);
    if (!Number.isInteger(id)) throw new ApiError(422, "Invalid changelog ID");
    const result = await mutatePublishChangelog(ops, id);
    return reply(result);
  }

  throw new ApiError(404, "Not found");
};

async function handleRequest(request: Request, params: Record<string, string>): Promise<Response> {
  try {
    const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const auth = request.headers.get("authorization");
    const key = auth?.startsWith("Bearer ") ? auth.slice(7, 20) : ip;
    const rl = await rateLimit(`api:${key}`, { window: 60, max: 60 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter!);

    if (request.method === "GET") return await getRoutes(request, params);
    if (request.method === "POST") return await postRoutes(request, params);
    throw new ApiError(405, "Method not allowed");
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => handleRequest(request, params),
      POST: ({ request, params }) => handleRequest(request, params),
    },
  },
});
