import { API_KEY_SCOPES, apiKey, createDb, membership, workspace } from "@openheard/db";
import type { ApiKeyScope, Db } from "@openheard/db";
import { user } from "@openheard/db/schema/auth";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Actor, OpCtx } from "./ops/context";

// A workspace key reaches only its own workspace. An account key acts for the
// person who made it, in any workspace they administer; `workspaceId` is the
// one it was made in, used when a call names none.
export type ApiContext = {
  db: Db;
  workspaceId: string;
  keyId: string;
  scope: ApiKeyScope;
  userId: string | null;
};

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// A new key reaches every workspace its maker administers unless it is
// limited to the one it was made in.
export const apiKeyInput = z.object({ name: z.string().trim().min(1).max(40), scope: z.enum(API_KEY_SCOPES).default("account") });

export async function authenticateApiKey(request: Request, db: Db = createDb()): Promise<ApiContext> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing or invalid Authorization header. Use: Bearer <api-key>");
  }
  const token = auth.slice(7);
  if (!token.startsWith("oh_")) {
    throw new ApiError(401, "Invalid API key format");
  }

  const hash = await sha256(token);

  const [key] = await db
    .select({ id: apiKey.id, workspaceId: apiKey.workspaceId, scope: apiKey.scope, createdBy: apiKey.createdBy })
    .from(apiKey)
    .where(and(eq(apiKey.hash, hash), isNull(apiKey.revokedAt)))
    .limit(1);

  if (!key) {
    throw new ApiError(401, "Invalid or revoked API key");
  }
  if (key.scope === "account" && !key.createdBy) {
    throw new ApiError(401, "This account key has no owner any more. Create a new one.");
  }

  const [ws] = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, key.workspaceId)).limit(1);
  if (!ws) {
    throw new ApiError(401, "Workspace not found");
  }

  db.update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, key.id))
    .then(() => {});

  return { db, workspaceId: key.workspaceId, keyId: key.id, scope: key.scope, userId: key.createdBy };
}

// The workspace a call acts on, and who acts. A workspace key refuses any
// other workspace; an account key needs its owner to be an admin there.
export async function resolveApiWorkspace(ctx: ApiContext, slug?: string | null): Promise<{ workspace: typeof workspace.$inferSelect; actor: Actor | null }> {
  const { db } = ctx;
  const target = slug?.trim().toLowerCase() || ctx.workspaceId;
  if (ctx.scope === "workspace" && target !== ctx.workspaceId) {
    throw new ApiError(403, `This key only reaches workspace '${ctx.workspaceId}'. To work across workspaces, create a key in Settings > API keys with 'Limit to this workspace' off.`);
  }
  let actor: Actor | null = null;
  if (ctx.userId) {
    const [u] = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.id, ctx.userId)).limit(1);
    actor = u ?? null;
  }
  if (ctx.scope === "account") {
    const [m] = await db
      .select({ role: membership.role })
      .from(membership)
      .where(and(eq(membership.workspaceId, target), eq(membership.userId, ctx.userId!)))
      .limit(1);
    if (!m || m.role !== "admin" || !actor) {
      const mine = await db
        .select({ id: membership.workspaceId })
        .from(membership)
        .where(and(eq(membership.userId, ctx.userId!), eq(membership.role, "admin")));
      const list = mine.map((w) => `'${w.id}'`).join(", ") || "none";
      throw new ApiError(403, `You are not an admin of workspace '${target}'. Workspaces you administer: ${list}`);
    }
  }
  const [ws] = await db.select().from(workspace).where(eq(workspace.id, target)).limit(1);
  if (!ws) throw new ApiError(404, `Workspace '${target}' not found`);
  return { workspace: ws, actor };
}

// The public origin of a workspace: its subdomain in the cloud, the request's
// own origin on a self-hosted install. Local dev without subdomains picks the
// workspace with ?ws=, which `query` carries.
export async function workspaceOrigin(workspaceId: string, requestOrigin: string): Promise<{ origin: string; query: string }> {
  const { env } = await import("@openheard/env/server");
  const vars = env as unknown as { ROOT_DOMAIN?: string; OPENHEARD_LOCAL?: string };
  const root = vars.ROOT_DOMAIN ?? null;
  if (root && workspaceId !== "default") {
    const req = new URL(requestOrigin || `https://${root}`);
    const local = root === "localhost";
    const protocol = local ? req.protocol : "https:";
    return { origin: `${protocol}//${workspaceId}.${root}${local && req.port ? `:${req.port}` : ""}`, query: "" };
  }
  const query = workspaceId !== "default" && vars.OPENHEARD_LOCAL === "1" ? `?ws=${workspaceId}` : "";
  return { origin: requestOrigin, query };
}

// The op context for an API or MCP call.
export async function apiOps(ctx: ApiContext, requestOrigin: string, slug?: string | null): Promise<OpCtx & { query: string }> {
  const { workspace: ws, actor } = await resolveApiWorkspace(ctx, slug);
  const { origin, query } = await workspaceOrigin(ws.id, requestOrigin);
  return { db: ctx.db, workspace: ws, actor, origin, query };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function apiJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// A response for a call that acted on one workspace: the body and a header
// both name it, so a call without ?workspace= is never ambiguous.
export function apiJsonFor(workspaceId: string, data: unknown, status = 200) {
  const body = data && typeof data === "object" && !Array.isArray(data) && !("workspace" in data) ? { workspace: workspaceId, ...data } : data;
  const res = apiJson(body, status);
  res.headers.set("openheard-workspace", workspaceId);
  return res;
}

export function apiErrorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return apiJson({ error: err.message }, err.status);
  }
  // Shared operations refuse with a status of their own.
  if (err instanceof Error && typeof (err as { status?: unknown }).status === "number") {
    return apiJson({ error: err.message }, (err as unknown as { status: number }).status);
  }
  const msg = err instanceof Error ? err.message : "Internal server error";
  return apiJson({ error: msg }, 500);
}
