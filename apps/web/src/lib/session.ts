import { createAuth } from "@openheard/auth";
import { createMiddleware } from "@tanstack/react-start";

export type SessionUser = { id: string; name: string; email: string; role: "admin" | "member"; image?: string | null };

export const sessionMiddleware = createMiddleware().server(async ({ next, request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers });
  const user = session
    ? ({
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: ((session.user as { role?: string }).role === "admin" ? "admin" : "member") as "admin" | "member",
        image: session.user.image,
      } satisfies SessionUser)
    : null;
  return next({ context: { user } });
});

export function requireUser(user: SessionUser | null): SessionUser {
  if (!user) throw new Error("Sign in to do that");
  return user;
}

export function requireAdmin(user: SessionUser | null): SessionUser {
  const u = requireUser(user);
  if (u.role !== "admin") throw new Error("Admins only");
  return u;
}
