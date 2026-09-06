import { createDb, membership } from "@openheard/db";
import { invite } from "@openheard/db/schema/feedback";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { requireAdmin, sessionMiddleware } from "@/lib/session";
import { sendInviteEmail } from "@/lib/email";

export const getWorkspaceMemberCount = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const db = createDb();
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(membership)
      .where(eq(membership.workspaceId, context.workspace.id));
    return row.n;
  });

export const createInvite = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) =>
    z.object({ email: z.string().email(), role: z.enum(["admin", "member"]).default("member") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const me = requireAdmin(context.user);
    const db = createDb();
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(invite).values({
      workspaceId: context.workspace.id,
      email: data.email,
      role: data.role,
      token,
      expiresAt,
    });

    const baseUrl = (await import("@openheard/env/server")).env.BETTER_AUTH_URL || "http://localhost:3001";
    const joinUrl = `${baseUrl}/join/${token}`;
    await sendInviteEmail(data.email, me.name, context.workspace.name, joinUrl);
    return { ok: true };
  });

export const listInvites = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    requireAdmin(context.user);
    const db = createDb();
    return db
      .select()
      .from(invite)
      .where(and(eq(invite.workspaceId, context.workspace.id), isNull(invite.acceptedAt)))
      .orderBy(invite.createdAt);
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ token: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    const db = createDb();
    await db
      .delete(invite)
      .where(and(eq(invite.workspaceId, context.workspace.id), eq(invite.token, data.token)));
    return { ok: true };
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ token: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const user = context.user;
    if (!user) throw new Error("Sign in first");
    const db = createDb();
    const [inv] = await db
      .select()
      .from(invite)
      .where(and(eq(invite.token, data.token), gt(invite.expiresAt, new Date()), isNull(invite.acceptedAt)));
    if (!inv) throw new Error("Invite not found or expired");

    await db
      .insert(membership)
      .values({ workspaceId: inv.workspaceId, userId: user.id, role: inv.role })
      .onConflictDoUpdate({ target: [membership.workspaceId, membership.userId], set: { role: inv.role } });
    await db.update(invite).set({ acceptedAt: new Date() }).where(eq(invite.token, data.token));
    return { workspaceId: inv.workspaceId };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ userId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const me = requireAdmin(context.user);
    if (data.userId === me.id) throw new Error("You cannot remove yourself");
    const db = createDb();
    await db
      .delete(membership)
      .where(and(eq(membership.workspaceId, context.workspace.id), eq(membership.userId, data.userId)));
    return { ok: true };
  });
