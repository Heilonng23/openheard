import { createAuth } from "@openheard/auth";
import { createDb, membership, workspace } from "@openheard/db";
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

export const sessionMiddleware = createMiddleware().server(async ({ next, request }) => {
  const db = createDb();
  const host = request.headers.get("host") ?? "";
  const root = await rootDomain();
  const marketing = isMarketingHost(host, root);
  const slug = workspaceSlugFromHost(host, root);
  let [ws] = await db.select().from(workspace).where(eq(workspace.id, slug)).limit(1);
  if (!ws && slug === "default") {
    // Fresh install: the default workspace has to exist before anyone can
    // reach the sign-in page, and the first account to sign up becomes admin.
    const { seedStatuses } = await import("./status-db");
    await db.insert(workspace).values({ id: "default" }).onConflictDoNothing();
    await seedStatuses(db, "default");
    [ws] = await db.select().from(workspace).where(eq(workspace.id, slug)).limit(1);
  }
  if (!ws) throw notFound();

  const session = await createAuth().api.getSession({ headers: request.headers });
  let user: SessionUser | null = null;
  if (session) {
    const [m] = await db
      .select({ role: membership.role })
      .from(membership)
      .where(and(eq(membership.workspaceId, ws.id), eq(membership.userId, session.user.id)))
      .limit(1);
    user = { id: session.user.id, name: session.user.name, email: session.user.email, role: m?.role ?? "guest", image: session.user.image };
  }
  return next({ context: { user, workspace: ws, marketing } });
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
