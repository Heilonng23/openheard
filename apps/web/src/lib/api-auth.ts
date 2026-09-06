import { apiKey, createDb, workspace } from "@openheard/db";
import type { Db } from "@openheard/db";
import { and, eq, isNull } from "drizzle-orm";

export type ApiContext = {
  db: Db;
  workspaceId: string;
  keyId: string;
};

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function authenticateApiKey(request: Request): Promise<ApiContext> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing or invalid Authorization header. Use: Bearer <api-key>");
  }
  const token = auth.slice(7);
  if (!token.startsWith("oh_")) {
    throw new ApiError(401, "Invalid API key format");
  }

  const hash = await sha256(token);
  const db = createDb();

  const [key] = await db
    .select({ id: apiKey.id, workspaceId: apiKey.workspaceId })
    .from(apiKey)
    .where(and(eq(apiKey.hash, hash), isNull(apiKey.revokedAt)))
    .limit(1);

  if (!key) {
    throw new ApiError(401, "Invalid or revoked API key");
  }

  const [ws] = await db.select().from(workspace).where(eq(workspace.id, key.workspaceId)).limit(1);
  if (!ws) {
    throw new ApiError(401, "Workspace not found");
  }

  db.update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, key.id))
    .then(() => {});

  return { db, workspaceId: key.workspaceId, keyId: key.id };
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

export function apiErrorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return apiJson({ error: err.message }, err.status);
  }
  const msg = err instanceof Error ? err.message : "Internal server error";
  return apiJson({ error: msg }, 500);
}
