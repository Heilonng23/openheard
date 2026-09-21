import type { workspace } from "@openheard/db";
import type { Role } from "@openheard/db/schema/feedback";
import { notFound } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";

import { DEMO_ADMIN_ID, DEMO_WORKSPACE_ID } from "./demo";

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

// Local dev serves one origin, so there are no real subdomains to hand a
// second workspace. With OPENHEARD_LOCAL=1, `?ws=<slug>` picks one and is
// remembered in a cookie so server functions on the same origin agree. The
// cloud never reads either: hosts are the only source of truth there.
async function localDev(): Promise<boolean> {
  const { env } = await import("@openheard/env/server");
  return (env as unknown as { OPENHEARD_LOCAL?: string }).OPENHEARD_LOCAL === "1";
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;

async function localWorkspaceOverride(request: Request): Promise<string | null> {
  const fromQuery = new URL(request.url).searchParams.get("ws");
  if (fromQuery && SLUG.test(fromQuery)) {
    // Remember it, so the next server-function POST (no query string) agrees.
    try {
      const { setCookie } = await import("@tanstack/react-start/server");
      setCookie("ws", fromQuery, { path: "/", sameSite: "lax" });
    } catch {
      // Raw handlers run outside the request context that owns the response.
    }
    return fromQuery;
  }
  const fromCookie = /(?:^|;\s*)ws=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1];
  return fromCookie && SLUG.test(fromCookie) ? fromCookie : null;
}

// The workspace slug a request is for, local override included.
export async function workspaceSlugFromRequest(request: Request): Promise<string> {
  const host = request.headers.get("host") ?? "";
  const root = await rootDomain();
  const fromHost = workspaceSlugFromHost(host, root);
  if (fromHost !== "default") return fromHost;
  if (!(await localDev())) return fromHost;
  return (await localWorkspaceOverride(request)) ?? fromHost;
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
  const slug = await workspaceSlugFromRequest(request);
  const { createDb, workspace } = await import("@openheard/db");
  const [ws] = await createDb().select().from(workspace).where(eq(workspace.id, slug)).limit(1);
  return ws ?? null;
}

const ctxCache = new WeakMap<Request, Promise<{ user: SessionUser | null; workspace: Workspace; marketing: boolean }>>();

async function resolveSession(request: Request) {
  const [{ createDb, membership, workspace }, { createAuth, sessionFromCloudflareAccess }] = await Promise.all([import("@openheard/db"), import("@openheard/auth")]);
  const db = createDb();
  const host = request.headers.get("host") ?? "";
  const root = await rootDomain();
  const marketing = isMarketingHost(host, root);
  const slug = await workspaceSlugFromRequest(request);

  const auth = createAuth({ demo: slug === DEMO_WORKSPACE_ID });
  const [wsResult, session] = await Promise.all([
    db.select().from(workspace).where(eq(workspace.id, slug)).limit(1),
    // No openheard session yet? Behind Cloudflare Access, the Access login is one.
    auth.api.getSession({ headers: request.headers }).then((s) => s ?? sessionFromCloudflareAccess(auth, request.headers)),
  ]);

  let [ws] = wsResult;
  if (!ws && slug === "default") {
    const { seedStatuses } = await import("./status-db");
    await db.insert(workspace).values({ id: "default" }).onConflictDoNothing();
    await seedStatuses(db, "default");
    [ws] = await db.select().from(workspace).where(eq(workspace.id, slug)).limit(1);
  }
  if (!ws) throw notFound();

  // The shared demo login is nobody outside the demo, whatever memberships
  // happen to exist. One check here covers every server function at once.
  if (session && session.user.id === DEMO_ADMIN_ID && ws.id !== DEMO_WORKSPACE_ID) {
    return { user: null, workspace: ws, marketing };
  }

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
