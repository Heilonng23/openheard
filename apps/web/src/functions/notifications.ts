import { changelogSubscriber, createDb, emailOptout, workspace } from "@openheard/db";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { isDemo } from "@/lib/demo";
import { sendEmail } from "@/lib/email";
import { CONFIRM_TTL_MS, signEmailToken, verifyEmailToken } from "@/lib/email-token";
import { applyUnsubscribe, emailSecret, optIn, optOut, workspaceName } from "@/lib/email-prefs";
import { invalidate } from "@/lib/kv-cache";
import { inBackground, normalizeEmail } from "@/lib/notify";
import { confirmSubscriptionEmail } from "@/lib/notify-email";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdmin, requireUser, sessionMiddleware } from "@/lib/session";

function clientIp(): string {
  const request = getRequest();
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// ---- public: the changelog subscribe box ----

// Same answer whether the address is new, pending or already confirmed, so
// the box cannot be used to learn who follows a workspace.
export const subscribeChangelog = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ email: z.string().trim().email("Enter a valid email").max(254) }).parse(d))
  .handler(async ({ data, context }) => {
    const ws = context.workspace;
    if (isDemo(ws)) throw new Error("The demo does not send email");
    const email = normalizeEmail(data.email);
    const [byIp, byAddress] = await Promise.all([
      rateLimit(`changelog-subscribe:${clientIp()}`, { window: 600, max: 5, failClosed: true }),
      rateLimit(`changelog-subscribe:${ws.id}:${email}`, { window: 3600, max: 2, failClosed: true }),
    ]);
    if (!byIp.allowed || !byAddress.allowed) throw new Error("Too many tries. Try again in a few minutes.");
    const db = createDb();
    const [existing] = await db
      .select({ confirmedAt: changelogSubscriber.confirmedAt })
      .from(changelogSubscriber)
      .where(and(eq(changelogSubscriber.workspaceId, ws.id), eq(changelogSubscriber.email, email)));
    if (existing?.confirmedAt) return { ok: true };
    if (!existing) await db.insert(changelogSubscriber).values({ workspaceId: ws.id, email }).onConflictDoNothing();
    const origin = new URL(getRequest().url).origin;
    const token = await signEmailToken({ k: "confirm", w: ws.id, e: email, x: Date.now() + CONFIRM_TTL_MS }, emailSecret());
    const mail = confirmSubscriptionEmail({ workspaceName: ws.name, confirmUrl: `${origin}/changelog/confirm?t=${token}` });
    await inBackground("changelog-confirm", () => sendEmail(email, mail.subject, mail.html, mail.text));
    return { ok: true };
  });

const tokenInput = z.object({ t: z.string().min(10).max(1000) });

export const confirmChangelog = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    const t = await verifyEmailToken(data.t, emailSecret());
    if (!t || t.k !== "confirm") return { ok: false as const };
    const db = createDb();
    const name = await workspaceName(db, t.w);
    if (!name) return { ok: false as const };
    await optIn(db, t.w, t.e, "changelog");
    return { ok: true as const, workspaceName: name };
  });

export const unsubscribe = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenInput.extend({ undo: z.boolean().default(false) }).parse(d))
  .handler(async ({ data }) => {
    const res = await applyUnsubscribe(data.t, data.undo);
    return res ? { ok: true as const, ...res } : { ok: false as const };
  });

// ---- settings: your own emails, and the workspace switch ----

export const getEmailPrefs = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const u = requireUser(context.user);
    const ws = context.workspace.id;
    const email = normalizeEmail(u.email);
    const db = createDb();
    const [outs, [sub]] = await Promise.all([
      db.select({ kind: emailOptout.kind }).from(emailOptout).where(and(eq(emailOptout.workspaceId, ws), eq(emailOptout.email, email))),
      db
        .select({ email: changelogSubscriber.email })
        .from(changelogSubscriber)
        .where(and(eq(changelogSubscriber.workspaceId, ws), eq(changelogSubscriber.email, email), isNotNull(changelogSubscriber.confirmedAt))),
    ]);
    const off = new Set(outs.map((o) => o.kind));
    return {
      followedPosts: !off.has("status"),
      changelog: Boolean(sub) && !off.has("changelog"),
      workspaceStatusEmails: context.workspace.statusEmails,
    };
  });

export const saveEmailPrefs = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ followedPosts: z.boolean(), changelog: z.boolean(), workspaceStatusEmails: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const u = requireUser(context.user);
    const ws = context.workspace.id;
    const email = normalizeEmail(u.email);
    const db = createDb();
    // The account address is already proven, so no double opt-in here.
    await (data.followedPosts ? optIn : optOut)(db, ws, email, "status");
    await (data.changelog ? optIn : optOut)(db, ws, email, "changelog");
    if (data.workspaceStatusEmails !== undefined && data.workspaceStatusEmails !== context.workspace.statusEmails) {
      requireAdmin(context.user);
      await db.update(workspace).set({ statusEmails: data.workspaceStatusEmails }).where(eq(workspace.id, ws));
      void invalidate(`workspace:${ws}`);
    }
    return { ok: true };
  });
