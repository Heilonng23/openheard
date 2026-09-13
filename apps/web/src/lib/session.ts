import type { workspace } from "@openheard/db";
import type { Role } from "@openheard/db/schema/feedback";
import { notFound } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";

export type SessionUser = { id: string; name: string; email: string; role: Role | "guest"; image?: string | null };
export type Workspace = typeof workspace.$inferSelect;

// Which workspace is this request for?
// Cloud: acme.openheard.com -> "acme" (ROOT_DOMAIN=openheard.com). Local dev
// works the same way with acme.localhost:3001. Anything else, including a
// self-hosted custom domain, is the "default" workspace.
export async function rootDomain(): Promise<string | null> {
  // Dynamic import keeps the server env (and dotenv) out of the client bundle,
  // since middleware objects are shipped to the browser.
  const { env } = await import("@openheard/env/server");
  return (env as unknown as { ROOT_DOMAIN?: string }).ROOT_DOMAIN ?? null;
}

export function workspaceSlugFromHost(host: string, rootDomainValue: string | null): string {
  const root = (rootDomainValue ?? "localhost").toLowerCase();
  const h = host.toLowerCase().split(":")[0]!;
  if (h.endsWith("." + root)) {
    const slug = h.slice(0, -(root.length + 1));
    if (slug && !slug.includes(".") && slug !== "www" && slug !== "app") return slug;
  }
  return "default";
}

// The bare root domain (and www) is the marketing site in the cloud, not a
// board. Self-hosted installs have no ROOT_DOMAIN and are never marketing.
export function isMarketingHost(host: string, rootDomainValue: string | null): boolean {
  if (!rootDomainValue || rootDomainValue === "localhost") return false;
  const h = host.toLowerCase().split(":")[0]!;
  const root = rootDomainValue.toLowerCase();
  return h === root || h === "www." + root;
}

// Workspace for a raw request (sitemap, RSS, API routes that have no session middleware).
export async function workspaceFromRequest(request: Request): Promise<Workspace | null> {
  const host = request.headers.get("host") ?? "";
  const slug = workspaceSlugFromHost(host, await rootDomain());
  const { createDb, workspace } = await import("@openheard/db");
  const [ws] = await createDb().select().from(workspace).where(eq(workspace.id, slug)).limit(1);
  return ws ?? null;
}

const ctxCache = new WeakMap<Request, Promise<{ user: SessionUser | null; workspace: Workspace; marketing: boolean }>>();

async function resolveSession(request: Request) {
  const [{ createDb, membership, workspace }, { createAuth }] = await Promise.all([import("@openheard/db"), import("@openheard/auth")]);
  const db = createDb();
  const host = request.headers.get("host") ?? "";
  const root = await rootDomain();
  const marketing = isMarketingHost(host, root);
  const slug = workspaceSlugFromHost(host, root);

  const [wsResult, session] = await Promise.all([
    db.select().from(workspace).where(eq(workspace.id, slug)).limit(1),
    createAuth().api.getSession({ headers: request.headers }),
  ]);

  let [ws] = wsResult;
  if (!ws && slug === "default") {
    const { seedStatuses } = await import("./status-db");
    await db.insert(workspace).values({ id: "default" }).onConflictDoNothing();
    await seedStatuses(db, "default");
    [ws] = await db.select().from(workspace).where(eq(workspace.id, slug)).limit(1);
  }
  if (!ws) throw notFound();

  let user: SessionUser | null = null;
  if (session) {
    const [m] = await db
      .select({ role: membership.role })
      .from(membership)
      .where(and(eq(membership.workspaceId, ws.id), eq(membership.userId, session.user.id)))
      .limit(1);
    user = { id: session.user.id, name: session.user.name, email: session.user.email, role: m?.role ?? "guest", image: session.user.image };
  }
  return { user, workspace: ws, marketing };
}

// Same resolution as sessionMiddleware, for raw route handlers.
export function getSessionContext(request: Request) {
  let pending = ctxCache.get(request);
  if (!pending) {
    pending = resolveSession(request);
    ctxCache.set(request, pending);
  }
  return pending;
}

export const sessionMiddleware = createMiddleware().server(async ({ next, request }) => {
  return next({ context: await getSessionContext(request) });
});

export type Ctx = { user: SessionUser | null; workspace: Workspace; marketing: boolean };

export function requireUser(user: SessionUser | null): SessionUser {
  if (!user) throw new Error("Sign in to do that");
  return user;
}

export function requireAdmin(user: SessionUser | null): SessionUser {
  const u = requireUser(user);
  if (u.role !== "admin") throw new Error("Admins only");
  return u;
}

export const isAdmin = (user: SessionUser | null) => user?.role === "admin";
