import { widgetToken, type Db } from "@openheard/db";
import { and, eq, gt, lt } from "drizzle-orm";

// The embedded widget's credential. It is not the session cookie: it is an
// opaque random value, stored only as a hash, bound to one workspace, short
// lived, and accepted by the handful of server functions the widget calls
// (see widgetSessionMiddleware). Signing in again through the popup mints a
// new one and the panel revokes the old one; signing out revokes it too.

export { WIDGET_TOKEN_HEADER } from "./widget-auth";
export const WIDGET_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const PREFIX = "ohw_";

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return PREFIX + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function mintWidgetToken(db: Db, opts: { userId: string; workspaceId: string; now?: number }) {
  const now = opts.now ?? Date.now();
  const token = randomToken();
  const expiresAt = new Date(now + WIDGET_TOKEN_TTL_MS);
  // Expired rows for this user go while we are here, so the table stays small.
  await db.delete(widgetToken).where(and(eq(widgetToken.userId, opts.userId), lt(widgetToken.expiresAt, new Date(now))));
  await db.insert(widgetToken).values({ id: await sha256(token), userId: opts.userId, workspaceId: opts.workspaceId, expiresAt });
  return { token, expiresAt: expiresAt.getTime() };
}

// The user a token speaks for, or null when it is unknown, expired, or was
// minted for another workspace.
export async function verifyWidgetToken(db: Db, token: string, workspaceId: string, now = Date.now()): Promise<string | null> {
  if (!token.startsWith(PREFIX) || token.length > 128) return null;
  const [row] = await db
    .select({ userId: widgetToken.userId })
    .from(widgetToken)
    .where(and(eq(widgetToken.id, await sha256(token)), eq(widgetToken.workspaceId, workspaceId), gt(widgetToken.expiresAt, new Date(now))))
    .limit(1);
  return row?.userId ?? null;
}

export async function revokeWidgetToken(db: Db, token: string) {
  if (!token.startsWith(PREFIX) || token.length > 128) return;
  await db.delete(widgetToken).where(eq(widgetToken.id, await sha256(token)));
}
