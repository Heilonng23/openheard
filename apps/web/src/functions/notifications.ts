import { changelogSubscriber, createDb, emailOptout, user, workspace } from "@openheard/db";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { isDemo } from "@/lib/demo";
import { sendEmail } from "@/lib/email";
import { CONFIRM_TTL_MS, signEmailToken, verifyEmailToken } from "@/lib/email-token";
import { applyUnsubscribe, confirmPending, emailSecret, optIn, optOut, workspaceName } from "@/lib/email-prefs";
import { invalidate } from "@/lib/kv-cache";
import { inBackground, normalizeEmail } from "@/lib/notify";
import { confirmSubscriptionEmail } from "@/lib/notify-email";
import { rateLimit } from "@/lib/rate-limit";
import { isAdmin, requireAdmin, requireUser, sessionMiddleware } from "@/lib/session";

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
    await requestConfirmation(ws, email);
    return { ok: true };
  });

// Starts the double opt-in: a pending row plus a confirm link by email.
// Nothing happens for an address that is already confirmed.
async function requestConfirmation(ws: { id: string; name: string }, email: string): Promise<boolean> {
  const db = createDb();
  const [existing] = await db
    .select({ confirmedAt: changelogSubscriber.confirmedAt })
    .from(changelogSubscriber)
    .where(and(eq(changelogSubscriber.workspaceId, ws.id), eq(changelogSubscriber.email, email)));
  if (existing?.confirmedAt) return false;
  if (!existing) await db.insert(changelogSubscriber).values({ workspaceId: ws.id, email }).onConflictDoNothing();
  const origin = new URL(getRequest().url).origin;
  const token = await signEmailToken({ k: "confirm", w: ws.id, e: email, x: Date.now() + CONFIRM_TTL_MS }, emailSecret());
  const mail = confirmSubscriptionEmail({ workspaceName: ws.name, confirmUrl: `${origin}/changelog/confirm?t=${token}` });
  await inBackground("changelog-confirm", () => sendEmail(email, mail.subject, mail.html, mail.text));
  return true;
}

const tokenInput = z.object({ t: z.string().min(10).max(1000) });

export const confirmChangelog = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    const t = await verifyEmailToken(data.t, emailSecret());
    if (!t || t.k !== "confirm") return { ok: false as const };
    const db = createDb();
    const name = await workspaceName(db, t.w);
    if (!name || !(await confirmPending(db, t.w, t.e))) return { ok: false as const };
    return { ok: true as const, workspaceName: name };
  });

export const unsubscribe = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    const res = await applyUnsubscribe(data.t);
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
      workspaceStatusEmails: isAdmin(context.user) ? context.workspace.statusEmails : undefined,
    };
  });

export const saveEmailPrefs = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ followedPosts: z.boolean(), changelog: z.boolean(), workspaceStatusEmails: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const u = requireUser(context.user);
    const changeWorkspace = data.workspaceStatusEmails !== undefined && data.workspaceStatusEmails !== context.workspace.statusEmails;
    if (changeWorkspace) requireAdmin(context.user);
    const ws = context.workspace.id;
    const email = normalizeEmail(u.email);
    const db = createDb();
    const [account] = await db.select({ verified: user.emailVerified }).from(user).where(eq(user.id, u.id));
    await (data.followedPosts ? optIn : optOut)(db, ws, email, "status");
    // A verified account address is proven, so no double opt-in. An
    // unverified one gets the same confirm link as the public subscribe box.
    let confirmSent = false;
    if (!data.changelog) await optOut(db, ws, email, "changelog");
    else if (account?.verified) await optIn(db, ws, email, "changelog");
    else {
      const limit = await rateLimit(`changelog-subscribe:${ws}:${email}`, { window: 3600, max: 2, failClosed: true });
      if (!limit.allowed) throw new Error("Too many tries. Try again in a few minutes.");
      confirmSent = await requestConfirmation(context.workspace, email);
    }
    if (changeWorkspace) {
      await db.update(workspace).set({ statusEmails: data.workspaceStatusEmails }).where(eq(workspace.id, ws));
      void invalidate(`workspace:${ws}`);
    }
    return { ok: true, confirmSent };
  });
