// Who hears about a status change or a changelog entry, and the sending.
// Server-only: it pulls the database in. Server functions import it inside
// their handlers.
import { changelogSubscriber, comment, emailOptout, post, user, vote } from "@openheard/db";
import type { Db, EmailKind } from "@openheard/db";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { DEMO_ADMIN_ID, isDemo } from "./demo";
import { type SendResult, sendEmail } from "./email";
import { type EmailTokenKind, signEmailToken } from "./email-token";
import { type Rendered, type StatusLabel, type Unsub, changelogEmail, statusChangeEmail } from "./notify-email";

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export type Candidate = { userId: string | null; email: string };
export type Exclusions = { actorId?: string | null; actorEmail?: string | null; optedOut: Set<string> };

// One address once. Never the person who made the change, never someone who
// opted out, never the shared demo login or a reserved `.invalid` address.
// Anonymous voters never reach here: they have a cookie token, not an email.
export function pickRecipients(candidates: Candidate[], ex: Exclusions): Candidate[] {
  const actorEmail = ex.actorEmail ? normalizeEmail(ex.actorEmail) : null;
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of candidates) {
    const email = normalizeEmail(c.email ?? "");
    if (!email || !email.includes("@") || email.endsWith(".invalid")) continue;
    if (c.userId && (c.userId === ex.actorId || c.userId === DEMO_ADMIN_ID)) continue;
    if (email === actorEmail || ex.optedOut.has(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ userId: c.userId, email });
  }
  return out;
}

// Everyone with an account who voted on, commented on or wrote these posts.
export async function followersOf(db: Db, postIds: number[]): Promise<Candidate[]> {
  if (!postIds.length) return [];
  const [authors, voters, commenters] = await Promise.all([
    db.select({ userId: user.id, email: user.email }).from(post).innerJoin(user, eq(user.id, post.authorId)).where(inArray(post.id, postIds)),
    db.select({ userId: user.id, email: user.email }).from(vote).innerJoin(user, eq(user.id, vote.userId)).where(inArray(vote.postId, postIds)),
    db.select({ userId: user.id, email: user.email }).from(comment).innerJoin(user, eq(user.id, comment.authorId)).where(inArray(comment.postId, postIds)),
  ]);
  return [...authors, ...voters, ...commenters];
}

export async function optedOut(db: Db, workspaceId: string, kind: EmailKind): Promise<Set<string>> {
  const rows = await db.select({ email: emailOptout.email }).from(emailOptout).where(and(eq(emailOptout.workspaceId, workspaceId), eq(emailOptout.kind, kind)));
  return new Set(rows.map((r) => r.email));
}

type WorkspaceLike = { id: string; statusEmails: boolean };

export async function statusRecipients(db: Db, ws: WorkspaceLike, postIds: number[], actor: { id: string; email?: string | null }): Promise<Candidate[]> {
  if (isDemo(ws) || !ws.statusEmails) return [];
  const [candidates, out] = await Promise.all([followersOf(db, postIds), optedOut(db, ws.id, "status")]);
  return pickRecipients(candidates, { actorId: actor.id, actorEmail: actor.email, optedOut: out });
}

export type ChangelogRecipient = Candidate & { follows: boolean; subscribed: boolean };

// Followers of the linked posts (under the status-email rules) plus confirmed
// changelog subscribers, one entry per address.
export async function changelogRecipients(db: Db, ws: WorkspaceLike, postIds: number[], actor: { id: string; email?: string | null }): Promise<ChangelogRecipient[]> {
  if (isDemo(ws)) return [];
  const followers = await statusRecipients(db, ws, postIds, actor);
  const [subs, out] = await Promise.all([
    db
      .select({ email: changelogSubscriber.email })
      .from(changelogSubscriber)
      .where(and(eq(changelogSubscriber.workspaceId, ws.id), isNotNull(changelogSubscriber.confirmedAt))),
    optedOut(db, ws.id, "changelog"),
  ]);
  const subscribers = pickRecipients(
    subs.map((s) => ({ userId: null, email: s.email })),
    { actorId: actor.id, actorEmail: actor.email, optedOut: out },
  );
  const subscribed = new Set(subscribers.map((s) => s.email));
  const byEmail = new Map<string, ChangelogRecipient>();
  for (const f of followers) byEmail.set(f.email, { ...f, follows: true, subscribed: subscribed.has(f.email) });
  for (const s of subscribers) if (!byEmail.has(s.email)) byEmail.set(s.email, { ...s, follows: false, subscribed: true });
  return [...byEmail.values()];
}

// ---- sending ----

// A Worker invocation has a bounded number of outbound calls and waitUntil
// gets about 30 seconds, so one event sends to at most this many people.
// Past that the rest are logged as skipped rather than silently dropped.
export const MAX_RECIPIENTS_PER_EVENT = 300;
const CONCURRENCY = 4;

export type Outgoing = { to: string } & Rendered & { headers?: Record<string, string> };
export type Sender = (to: string, subject: string, html: string, text: string, opts?: { headers?: Record<string, string> }) => Promise<SendResult>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function deliver(messages: Outgoing[], send: Sender = sendEmail, label = "notify"): Promise<{ sent: number; failed: number; skipped: number }> {
  const queue = messages.slice(0, MAX_RECIPIENTS_PER_EVENT);
  let skipped = messages.length - queue.length;
  let sent = 0;
  let failed = 0;
  let stop = false;
  async function worker() {
    for (let m = queue.shift(); m; m = queue.shift()) {
      if (stop) {
        skipped++;
        continue;
      }
      let res = await send(m.to, m.subject, m.html, m.text, { headers: m.headers });
      // One backoff for a rate limit; a daily cap will not lift this invocation.
      for (let attempt = 1; !res.ok && res.code === "E_RATE_LIMIT_EXCEEDED" && attempt <= 2; attempt++) {
        await sleep(500 * 2 ** attempt);
        res = await send(m.to, m.subject, m.html, m.text, { headers: m.headers });
      }
      if (res.ok) sent++;
      else {
        failed++;
        if (res.code === "E_DAILY_LIMIT_EXCEEDED") stop = true;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (failed || skipped) console.error(`[${label}] sent ${sent}, failed ${failed}, skipped ${skipped}`);
  return { sent, failed, skipped };
}

// waitUntil exists in the Worker but not in the local stand-in; without it the
// work is awaited. Either way a failure is logged, never thrown at the caller.
export async function inBackground(label: string, work: () => Promise<unknown>): Promise<void> {
  const run = work().catch((err) => console.error(`[${label}] failed:`, err instanceof Error ? err.message : err));
  try {
    const mod = (await import("cloudflare:workers")) as { waitUntil?: (p: Promise<unknown>) => void };
    if (typeof mod.waitUntil === "function") {
      mod.waitUntil(run);
      return;
    }
  } catch {
    // no Workers runtime here
  }
  await run;
}

async function secret(): Promise<string> {
  const { env } = await import("@openheard/env/server");
  return (env as unknown as { BETTER_AUTH_SECRET: string }).BETTER_AUTH_SECRET;
}

const UNSUB_LABEL: Record<Exclude<EmailTokenKind, "confirm">, string> = {
  status: "Stop emails about posts you follow",
  changelog: "Stop changelog emails",
};

async function unsubLinks(origin: string, workspaceId: string, email: string, kinds: Exclude<EmailTokenKind, "confirm">[], key: string) {
  const unsubs: Unsub[] = [];
  let header: Record<string, string> | undefined;
  for (const k of kinds) {
    const t = await signEmailToken({ k, w: workspaceId, e: email }, key);
    unsubs.push({ url: `${origin}/unsubscribe?t=${t}`, label: UNSUB_LABEL[k] });
    // The inbox's own unsubscribe button: one POST, no page, no sign-in.
    header ??= { "List-Unsubscribe": `<${origin}/api/unsubscribe?t=${t}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  }
  return { unsubs, headers: header };
}

export type StatusChange = {
  postId: number;
  postTitle: string;
  from: StatusLabel;
  to: StatusLabel;
  note?: string | null;
};

export async function buildStatusEmails(input: {
  db: Db;
  workspace: WorkspaceLike & { name: string };
  origin: string;
  actor: { id: string; email?: string | null };
  change: StatusChange;
  key?: string;
}): Promise<Outgoing[]> {
  const { db, workspace, origin, actor, change } = input;
  const recipients = await statusRecipients(db, workspace, [change.postId], actor);
  if (!recipients.length) return [];
  const key = input.key ?? (await secret());
  const postUrl = `${origin}/p/${change.postId}`;
  return Promise.all(
    recipients.map(async (r) => {
      const { unsubs, headers } = await unsubLinks(origin, workspace.id, r.email, ["status"], key);
      return { to: r.email, headers, ...statusChangeEmail({ workspaceName: workspace.name, postTitle: change.postTitle, postUrl, from: change.from, to: change.to, note: change.note, unsubs }) };
    }),
  );
}

export async function buildChangelogEmails(input: {
  db: Db;
  workspace: WorkspaceLike & { name: string };
  origin: string;
  actor: { id: string; email?: string | null };
  entry: { title: string; version?: string | null; body: string };
  posts: { id: number; title: string }[];
  key?: string;
}): Promise<Outgoing[]> {
  const { db, workspace, origin, actor, entry, posts } = input;
  const recipients = await changelogRecipients(db, workspace, posts.map((p) => p.id), actor);
  if (!recipients.length) return [];
  const key = input.key ?? (await secret());
  const linked = posts.map((p) => ({ title: p.title, url: `${origin}/p/${p.id}` }));
  return Promise.all(
    recipients.map(async (r) => {
      const kinds: ("status" | "changelog")[] = [...(r.follows ? (["status"] as const) : []), ...(r.subscribed ? (["changelog"] as const) : [])];
      const { unsubs, headers } = await unsubLinks(origin, workspace.id, r.email, kinds, key);
      return {
        to: r.email,
        headers,
        ...changelogEmail({ workspaceName: workspace.name, title: entry.title, version: entry.version, body: entry.body, entryUrl: `${origin}/changelog`, posts: linked, follows: r.follows, unsubs }),
      };
    }),
  );
}
