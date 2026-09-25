// Server side of outbound alerts: sealing webhook URLs at rest, turning a
// post, comment or changelog entry into an AlertEvent, and delivering it in
// the background with one retry. Import only from server functions and API
// handlers; the rules themselves are in integrations.ts.
import { changelogEntry, comment, integration, post, status, workspace, type Db } from "@openheard/db";
import { user } from "@openheard/db/schema/auth";
import { and, eq } from "drizzle-orm";

import { DEMO_WORKSPACE_ID } from "./demo";
import {
  type AlertEvent,
  type IntegrationEvent,
  type IntegrationKind,
  SIGNATURE_HEADER,
  checkIntegrationUrl,
  isPrivateIPv4,
  isPrivateIPv6,
  parseList,
  payloadFor,
  signBody,
  wantsEvent,
} from "./integrations";
import { workspaceUrl } from "./workspace-url";

// ---- sealing ----

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function sealKey(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("openheard-integrations"), info: new TextEncoder().encode("v1") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function authSecret(): Promise<string> {
  const { env } = await import("@openheard/env/server");
  const secret = (env as unknown as { BETTER_AUTH_SECRET?: string }).BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET || "";
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required to store integrations");
  return secret;
}

export async function seal(plain: string, secret?: string): Promise<string> {
  const key = await sealKey(secret ?? (await authSecret()));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  return `v1:${b64(iv)}:${b64(ct)}`;
}

export async function unseal(sealed: string, secret?: string): Promise<string> {
  const [v, iv, ct] = sealed.split(":");
  if (v !== "v1" || !iv || !ct) throw new Error("Unreadable integration secret");
  const key = await sealKey(secret ?? (await authSecret()));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ct)));
}

// ---- delivery ----

const TIMEOUT_MS = 5000;

export type Delivery = { ok: true } | { ok: false; error: string };

export async function allowLocal(): Promise<boolean> {
  const { env } = await import("@openheard/env/server");
  return (env as unknown as { OPENHEARD_LOCAL?: string }).OPENHEARD_LOCAL === "1";
}

// Returns every A and AAAA answer for a name. A name with no answers, or a
// lookup that fails, is treated as unsafe by the caller.
export type Resolve = (host: string) => Promise<string[]>;

export const resolveOverHttps: Resolve = async (host) => {
  const lookup = async (type: "A" | "AAAA") => {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`DNS lookup failed (HTTP ${res.status})`);
    const json = (await res.json()) as { Status: number; Answer?: { type: number; data: string }[] };
    if (json.Status !== 0 && json.Status !== 3) throw new Error("DNS lookup failed");
    return (json.Answer ?? []).filter((a) => a.type === 1 || a.type === 28).map((a) => a.data);
  };
  const [v4, v6] = await Promise.all([lookup("A"), lookup("AAAA")]);
  return [...v4, ...v6];
};

// A plain webhook can point anywhere, so its host is checked again before
// every send: the URL rules, then every address its name resolves to. Slack
// and Discord only ever go to their own hosts.
export async function checkWebhookHost(url: string, resolve: Resolve): Promise<string | null> {
  const host = new URL(url).hostname.toLowerCase();
  if (["localhost", "127.0.0.1"].includes(host) && (await allowLocal())) return null;
  const rules = checkIntegrationUrl("webhook", url);
  if (!rules.ok) return rules.error;
  if (/^[\d.]+$/.test(host)) return null; // a public IP literal, already checked
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    return `Could not look up ${host}`;
  }
  if (!addresses.length) return `${host} does not resolve`;
  if (addresses.some((a) => (a.includes(":") ? isPrivateIPv6(a) : isPrivateIPv4(a)))) return "That host is not reachable from openheard";
  return null;
}

async function attempt(kind: IntegrationKind, url: string, signingSecret: string | null, event: AlertEvent, fetchImpl: typeof fetch): Promise<Delivery> {
  const body = JSON.stringify(payloadFor(kind, event));
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "openheard-webhooks/1" };
  if (kind === "webhook") {
    headers["x-openheard-event"] = event.type;
    if (signingSecret) headers[SIGNATURE_HEADER] = await signBody(signingSecret, body, Math.floor(Date.parse(event.at) / 1000));
  }
  try {
    // No redirects: a 30x to an internal address would undo the host check.
    const res = await fetchImpl(url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) return { ok: true };
    const detail = (await res.text().catch(() => "")).slice(0, 120).trim();
    return { ok: false, error: `HTTP ${res.status}${detail ? `: ${detail}` : ""}` };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    return { ok: false, error: name === "TimeoutError" ? "Timed out after 5s" : err instanceof Error ? err.message : "Request failed" };
  }
}

// One retry after a short pause, then give up and record why. A blocked host
// stays blocked, so that is not retried.
export async function deliver(
  kind: IntegrationKind,
  url: string,
  signingSecret: string | null,
  event: AlertEvent,
  fetchImpl: typeof fetch = fetch,
  pauseMs = 800,
  resolve: Resolve = resolveOverHttps,
): Promise<Delivery> {
  if (kind === "webhook") {
    const blocked = await checkWebhookHost(url, resolve);
    if (blocked) return { ok: false, error: blocked };
  }
  const first = await attempt(kind, url, signingSecret, event, fetchImpl);
  if (first.ok) return first;
  await new Promise((r) => setTimeout(r, pauseMs));
  return attempt(kind, url, signingSecret, event, fetchImpl);
}

export async function recordDelivery(db: Db, id: string, result: Delivery) {
  await db
    .update(integration)
    .set({ lastStatus: result.ok ? "ok" : "error", lastError: result.ok ? null : result.error.slice(0, 300), lastAt: new Date() })
    .where(eq(integration.id, id));
}

// waitUntil exists in the Worker but not in the local stand-in; there the
// work is awaited, which the timeouts above keep short.
async function background(work: Promise<unknown>): Promise<void> {
  try {
    const mod = (await import("cloudflare:workers")) as { waitUntil?: (p: Promise<unknown>) => void };
    if (typeof mod.waitUntil === "function") {
      mod.waitUntil(work);
      return;
    }
  } catch {
    // no Workers runtime here
  }
  await work;
}

// ---- events ----

export type Trigger =
  | { type: "post.created"; postId: number }
  | { type: "comment.created"; commentId: number }
  | { type: "post.status_changed"; postId: number; fromStatus: string }
  | { type: "changelog.published"; entryId: number };

// Links in a message must work from outside the request that caused it, so
// cloud workspaces use their own subdomain and self-hosts the auth base URL.
async function workspaceOrigin(workspaceId: string, requestOrigin?: string): Promise<string> {
  if (requestOrigin) return requestOrigin;
  const { env } = await import("@openheard/env/server");
  const e = env as unknown as { ROOT_DOMAIN?: string; BETTER_AUTH_URL?: string };
  if (e.ROOT_DOMAIN && workspaceId !== "default") return workspaceUrl(workspaceId, e.ROOT_DOMAIN, "");
  return (e.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
}

async function statusLabel(db: Db, workspaceId: string, key: string): Promise<string> {
  const [s] = await db.select({ label: status.label }).from(status).where(and(eq(status.workspaceId, workspaceId), eq(status.key, key))).limit(1);
  return s?.label ?? key;
}

async function postEvent(db: Db, ws: { id: string; name: string }, origin: string, postId: number) {
  const [p] = await db
    .select({ id: post.id, title: post.title, status: post.status, votes: post.voteCount, boardId: post.boardId, author: user.name })
    .from(post)
    .leftJoin(user, eq(user.id, post.authorId))
    .where(and(eq(post.id, postId), eq(post.workspaceId, ws.id)))
    .limit(1);
  if (!p) return null;
  return { workspace: ws, boardId: p.boardId, url: `${origin}/p/${p.id}`, title: p.title, author: p.author, status: await statusLabel(db, ws.id, p.status), votes: p.votes, postId: p.id };
}

export async function buildEvent(db: Db, workspaceId: string, trigger: Trigger, origin: string): Promise<AlertEvent | null> {
  const [w] = await db.select({ id: workspace.id, name: workspace.name }).from(workspace).where(eq(workspace.id, workspaceId)).limit(1);
  if (!w) return null;
  const at = new Date().toISOString();
  if (trigger.type === "changelog.published") {
    const [c] = await db
      .select({ id: changelogEntry.id, title: changelogEntry.title, version: changelogEntry.version, author: user.name })
      .from(changelogEntry)
      .leftJoin(user, eq(user.id, changelogEntry.authorId))
      .where(and(eq(changelogEntry.id, trigger.entryId), eq(changelogEntry.workspaceId, workspaceId)))
      .limit(1);
    if (!c) return null;
    return { type: trigger.type, workspace: w, boardId: null, url: `${origin}/changelog`, title: c.title, author: c.author, status: null, votes: null, version: c.version, at };
  }
  if (trigger.type === "comment.created") {
    const [c] = await db
      .select({ postId: comment.postId, body: comment.body, internal: comment.internal, author: user.name })
      .from(comment)
      .leftJoin(user, eq(user.id, comment.authorId))
      .where(eq(comment.id, trigger.commentId))
      .limit(1);
    // Internal notes stay inside the dashboard.
    if (!c || c.internal) return null;
    const p = await postEvent(db, w, origin, c.postId);
    if (!p) return null;
    return { ...p, type: trigger.type, author: c.author, comment: c.body || null, at };
  }
  const p = await postEvent(db, w, origin, trigger.postId);
  if (!p) return null;
  if (trigger.type === "post.status_changed") return { ...p, type: trigger.type, fromStatus: await statusLabel(db, workspaceId, trigger.fromStatus), at };
  return { ...p, type: trigger.type, at };
}

export async function dispatchEvent(db: Db, workspaceId: string, trigger: Trigger, requestOrigin?: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  if (workspaceId === DEMO_WORKSPACE_ID) return 0;
  const rows = await db.select().from(integration).where(and(eq(integration.workspaceId, workspaceId), eq(integration.enabled, true)));
  if (!rows.length) return 0;
  const event = await buildEvent(db, workspaceId, trigger, await workspaceOrigin(workspaceId, requestOrigin));
  if (!event) return 0;
  const targets = rows.filter((r) => wantsEvent({ enabled: r.enabled, events: (parseList(r.events) ?? []) as IntegrationEvent[], boardIds: parseList(r.boardIds) }, event.type, event.boardId));
  await Promise.all(
    targets.map(async (r) => {
      let result: Delivery;
      try {
        const url = await unseal(r.urlEnc);
        const secret = r.secretEnc ? await unseal(r.secretEnc) : null;
        result = await deliver(r.kind, url, secret, event, fetchImpl);
      } catch (err) {
        result = { ok: false, error: err instanceof Error ? err.message : "Delivery failed" };
      }
      await recordDelivery(db, r.id, result);
    }),
  );
  return targets.length;
}

// Fire and forget from a request. Alerts never fail the write that caused them.
export function notifyIntegrations(db: Db, workspaceId: string, trigger: Trigger, requestOrigin?: string): void {
  if (workspaceId === DEMO_WORKSPACE_ID) return;
  void background(dispatchEvent(db, workspaceId, trigger, requestOrigin).catch(() => undefined));
}
