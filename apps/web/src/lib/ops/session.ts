import { createDb } from "@openheard/db";
import { getRequest } from "@tanstack/react-start/server";

import { type Ctx, requireAdmin } from "@/lib/session";

import type { OpCtx } from "./context";

export function requestOrigin(): string {
  try {
    return new URL(getRequest().url).origin;
  } catch {
    return "";
  }
}

// The op context for a dashboard server function. Admins only.
export function adminOps(context: Ctx): OpCtx {
  const u = requireAdmin(context.user);
  return { db: createDb(), workspace: context.workspace, actor: { id: u.id, name: u.name, email: u.email }, origin: requestOrigin() };
}
