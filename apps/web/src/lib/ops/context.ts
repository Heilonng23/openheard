import type { Db } from "@openheard/db";

import { purgeWorkspaceCache } from "@/lib/cache";
import { invalidate } from "@/lib/kv-cache";
import type { Workspace } from "@/lib/session";

// Admin operations shared by the dashboard's server functions, the HTTP API
// and the MCP server. Server-only: never import from a route or component.
//
// `actor` is the admin doing it. API keys made by the local script have no
// owner, so it can be null; anything that needs a person (votes, workspace
// creation) says so.
export type Actor = { id: string; name: string; email: string };
export type OpCtx = { db: Db; workspace: Workspace; actor: Actor | null; origin: string };

// A refusal the caller can act on. `status` is what the HTTP API answers with.
export class OpError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

export function needActor(ctx: OpCtx, what: string): Actor {
  if (!ctx.actor) throw new OpError(`${what} needs a person behind the key. Create the key from Settings > API keys while signed in.`, 403);
  return ctx.actor;
}

// The shell data (boards, statuses, counts) and the public pages' edge copies.
export function refresh(ctx: OpCtx, postIds?: number[]) {
  void invalidate(`workspace:${ctx.workspace.id}`);
  void purgeWorkspaceCache(ctx.origin, postIds);
}

// "a, b and c" for error messages that list what does exist.
export function listOf(items: string[], none = "none yet"): string {
  if (!items.length) return none;
  return items.map((s) => `'${s}'`).join(", ");
}
