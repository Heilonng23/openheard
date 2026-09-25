// Outbound alerts: Slack, Discord and a plain signed webhook. Everything here
// is pure so the settings page, the server and the tests share one copy of
// the rules. Storage, encryption and delivery live in integration-db.ts.
import type { IntegrationEvent, IntegrationKind } from "@openheard/db/schema/integrations";

export type { IntegrationEvent, IntegrationKind };

export const KINDS: IntegrationKind[] = ["slack", "discord", "webhook"];

export const EVENTS: { key: IntegrationEvent; label: string }[] = [
  { key: "post.created", label: "New post" },
  { key: "comment.created", label: "New comment" },
  { key: "post.status_changed", label: "Status change" },
  { key: "changelog.published", label: "Changelog published" },
];

export const EVENT_KEYS = EVENTS.map((e) => e.key);

// ---- URL rules ----

const SLACK_HOSTS = ["hooks.slack.com"];
const DISCORD_HOSTS = ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"];

// Private, loopback, link-local, shared (CGNAT) and reserved addresses. Used
// on IP literals in a URL and on every DNS answer before a plain webhook is
// sent, so a public-looking name cannot point openheard at an internal host.
export function isPrivateIPv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return true;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function ipv6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0]!;
  const tail = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (tail) {
    const [a, b, c, d] = tail.slice(1).map(Number) as [number, number, number, number];
    s = s.slice(0, tail.index) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  const parts = [...head, ...Array(Math.max(fill, 0)).fill("0"), ...rest];
  if (parts.length !== 8 || parts.some((p) => !/^[0-9a-f]{1,4}$/.test(p))) return null;
  return parts.map((p) => parseInt(p, 16));
}

export function isPrivateIPv6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (!g) return true;
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  if (g.slice(0, 6).every((x) => x === 0)) return true; // ::, ::1 and IPv4-compatible
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPrivateIPv4(v4(g[6]!, g[7]!)); // IPv4-mapped
  if (g[0] === 0x64 && g[1] === 0xff9b) return isPrivateIPv4(v4(g[6]!, g[7]!)); // NAT64
  if (g[0] === 0x2002) return isPrivateIPv4(v4(g[1]!, g[2]!)); // 6to4
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentation
  return (g[0]! & 0xfe00) === 0xfc00 || (g[0]! & 0xffc0) === 0xfe80 || (g[0]! & 0xff00) === 0xff00;
}

// IP literals in a private range, plus names that only resolve inside a
// network. Public names are resolved and checked again at send time.
function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".home.arpa")) return true;
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return true; // decimal or hex IPv4
  if (/^[\d.]+$/.test(h)) return isPrivateIPv4(h);
  if (h.includes(":")) return true; // any IPv6 literal; real endpoints have names
  return false;
}

export type UrlCheck = { ok: true; url: string } | { ok: false; error: string };

// `allowLocal` lets a local dev install point the plain webhook at a mock on
// localhost. It is never true in the Worker.
export function checkIntegrationUrl(kind: IntegrationKind, raw: string, opts: { allowLocal?: boolean } = {}): UrlCheck {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "That is not a URL" };
  }
  if (u.username || u.password) return { ok: false, error: "URLs with a username or password are not accepted" };
  const host = u.hostname.toLowerCase();
  if (kind === "slack") {
    if (u.protocol !== "https:" || !SLACK_HOSTS.includes(host) || u.port) return { ok: false, error: "Paste a Slack incoming webhook, it starts with https://hooks.slack.com/" };
    if (!/^\/(services|triggers|workflows)\/[A-Za-z0-9/_-]+$/.test(u.pathname)) return { ok: false, error: "That Slack URL is missing its webhook path" };
    return { ok: true, url: `https://${host}${u.pathname}` };
  }
  if (kind === "discord") {
    if (u.protocol !== "https:" || !DISCORD_HOSTS.includes(host) || u.port) return { ok: false, error: "Paste a Discord webhook, it starts with https://discord.com/api/webhooks/" };
    if (!/^\/api(\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(u.pathname)) return { ok: false, error: "That Discord URL is missing its webhook id or token" };
    return { ok: true, url: `https://${host}${u.pathname}${u.search}` };
  }
  const local = opts.allowLocal && (u.protocol === "http:" || u.protocol === "https:") && ["localhost", "127.0.0.1"].includes(host);
  if (local) return { ok: true, url: u.toString() };
  if (u.protocol !== "https:") return { ok: false, error: "Webhook URLs must use https" };
  if (isPrivateHost(host) || !host.includes(".")) return { ok: false, error: "That host is not reachable from openheard" };
  if (u.port && u.port !== "443") return { ok: false, error: "Webhooks go to port 443" };
  return { ok: true, url: u.toString() };
}

// Keeps the picked boards that still exist. A pick where none are left is
// refused rather than stored as null, which would mean every board.
export function ownedBoards(picked: string[] | null, owned: string[]): string[] | null {
  if (!picked?.length) return null;
  const keep = [...new Set(picked)].filter((id) => owned.includes(id));
  if (!keep.length) throw new Error("The boards you picked no longer exist. Reload the page and pick again");
  return keep;
}

export const urlHint = (url: string) => url.replace(/\/+$/, "").slice(-4);

// ---- filtering ----

export type IntegrationRule = { enabled: boolean; events: IntegrationEvent[]; boardIds: string[] | null };

// Changelog entries belong to no board, so a board filter never hides them.
export function wantsEvent(rule: IntegrationRule, type: IntegrationEvent, boardId: string | null): boolean {
  if (!rule.enabled || !rule.events.includes(type)) return false;
  if (!boardId || !rule.boardIds || rule.boardIds.length === 0) return true;
  return rule.boardIds.includes(boardId);
}

export function parseList(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

// ---- payloads ----

export type AlertEvent = {
  type: IntegrationEvent;
  workspace: { id: string; name: string };
  boardId: string | null;
  url: string;
  title: string;
  author: string | null;
  status: string | null;
  fromStatus?: string | null;
  votes: number | null;
  postId?: number;
  comment?: string | null;
  version?: string | null;
  at: string;
  test?: boolean;
};

const HEADLINE: Record<IntegrationEvent, string> = {
  "post.created": "New post",
  "comment.created": "New comment",
  "post.status_changed": "Status changed",
  "changelog.published": "Changelog published",
};

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// The one-line summary under the title: who, what status, how many votes.
export function metaLine(e: AlertEvent): string {
  const parts = [e.test ? "Test message" : HEADLINE[e.type]];
  if (e.author) parts.push(`by ${e.author}`);
  if (e.type === "post.status_changed" && e.fromStatus && e.status) parts.push(`${e.fromStatus} → ${e.status}`);
  else if (e.status) parts.push(e.status);
  if (e.version) parts.push(e.version);
  if (e.votes !== null) parts.push(`${e.votes} ${e.votes === 1 ? "vote" : "votes"}`);
  return parts.join(" · ");
}

// Slack reads <, > and & as markup; escaping them also stops a post title
// from pinging <!channel>.
const slackEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function slackPayload(e: AlertEvent) {
  const title = slackEscape(clip(e.title, 150));
  const lines = [`*<${e.url}|${title}>*`, slackEscape(metaLine(e))];
  if (e.comment) lines.push(`> ${slackEscape(clip(e.comment, 280)).replace(/\n+/g, " ")}`);
  return {
    text: `${e.test ? "Test message" : HEADLINE[e.type]}: ${slackEscape(clip(e.title, 150))}`,
    blocks: [{ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } }],
    unfurl_links: false,
  };
}

const DISCORD_COLOR: Record<IntegrationEvent, number> = {
  "post.created": 0x6e8bff,
  "comment.created": 0x9a9aa3,
  "post.status_changed": 0xcdb37a,
  "changelog.published": 0x7fb894,
};

export function discordPayload(e: AlertEvent) {
  const description = [metaLine(e), e.comment ? `> ${clip(e.comment, 280).replace(/\n+/g, " ")}` : ""].filter(Boolean).join("\n");
  return {
    username: "openheard",
    // Nothing in a post title may ping @everyone or a role.
    allowed_mentions: { parse: [] as string[] },
    embeds: [{ title: clip(e.title, 250), url: e.url, description, color: DISCORD_COLOR[e.type], footer: { text: e.workspace.name } }],
  };
}

export function webhookPayload(e: AlertEvent) {
  return {
    event: e.type,
    test: e.test ?? false,
    workspace: e.workspace,
    data: {
      title: e.title,
      url: e.url,
      author: e.author,
      status: e.status,
      fromStatus: e.fromStatus ?? null,
      votes: e.votes,
      boardId: e.boardId,
      postId: e.postId ?? null,
      comment: e.comment ?? null,
      version: e.version ?? null,
    },
    sentAt: e.at,
  };
}

export function payloadFor(kind: IntegrationKind, e: AlertEvent): unknown {
  return kind === "slack" ? slackPayload(e) : kind === "discord" ? discordPayload(e) : webhookPayload(e);
}

// ---- signatures ----

export const SIGNATURE_HEADER = "x-openheard-signature";

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`. Receivers recompute
// it with their secret and reject old timestamps to stop replays.
export async function signBody(secret: string, body: string, timestamp: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  return `t=${timestamp},v1=${hex(mac)}`;
}

export function newSigningSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return "whsec_" + hex(bytes.buffer);
}
