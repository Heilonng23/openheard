// The embedded widget's credential and the checks around it: the token is
// its own thing, bound to a workspace, short lived, revocable, and only the
// widget's server functions accept it. Token rules run against the real
// schema; the session resolution runs the real session.ts with the database
// swapped for an in-memory one.
import { createClient } from "@libsql/client";
import type { Db } from "@openheard/db";
import * as schema from "@openheard/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown as Db }));

vi.mock("@openheard/env/server", () => ({ env: {} }));
vi.mock("@openheard/db", async () => ({ ...(await import("@openheard/db/schema/index")), createDb: () => h.db }));
// The real auth resolves a session from the cookie alone; this stands in for
// it with one fixed cookie that belongs to the workspace admin.
vi.mock("@openheard/auth", () => ({
  createAuth: () => ({}),
  sessionForRequest: async (_auth: unknown, headers: Headers) =>
    headers.get("cookie") === "session=owner" ? { user: { id: "owner", name: "Owner", email: "owner@acme.test", image: null } } : null,
}));

import { edgeCacheKey } from "./cache";
import { getSessionContext, getWidgetSessionContext } from "./session";
import { MSG, WIDGET_TOKEN_HEADER, newNonce, sessionFromMessage } from "./widget-auth";
import { frameAncestorsFor } from "./widget-frame";
import { frameAncestors, parseEmbedOrigins } from "./widget-origins";
import { WIDGET_TOKEN_TTL_MS, mintWidgetToken, revokeWidgetToken, verifyWidgetToken } from "./widget-token";

const MIGRATIONS = new URL("../../../../packages/db/migrations/", import.meta.url).pathname;
const FUNCTIONS = new URL("../functions/", import.meta.url).pathname;

async function freshDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(MIGRATIONS + file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  await client.execute("PRAGMA foreign_keys = ON");
  return drizzle(client, { schema }) as unknown as Db;
}

// Two workspaces; "owner" is the admin of the default one.
async function seed(db: Db) {
  await db.insert(schema.workspace).values([{ id: "default" }, { id: "other" }]);
  await db.insert(schema.user).values({ id: "owner", name: "Owner", email: "owner@acme.test" });
  await db.insert(schema.membership).values({ workspaceId: "default", userId: "owner", role: "admin" });
}

function req(headers: Record<string, string>) {
  return new Request("http://localhost/_serverFn/x", { method: "POST", headers: { host: "localhost", ...headers } });
}

describe("widget tokens", () => {
  beforeEach(async () => {
    h.db = await freshDb();
    await seed(h.db);
  });

  it("are random, stored only as a hash, and verify for their workspace", async () => {
    const a = await mintWidgetToken(h.db, { userId: "owner", workspaceId: "default" });
    const b = await mintWidgetToken(h.db, { userId: "owner", workspaceId: "default" });
    expect(a.token).not.toBe(b.token);
    const rows = await h.db.select().from(schema.widgetToken);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id)).not.toContain(a.token);
    expect(await verifyWidgetToken(h.db, a.token, "default")).toBe("owner");
  });

  it("do not work on another workspace", async () => {
    const { token } = await mintWidgetToken(h.db, { userId: "owner", workspaceId: "default" });
    expect(await verifyWidgetToken(h.db, token, "other")).toBeNull();
  });

  it("expire", async () => {
    const now = Date.now();
    const { token, expiresAt } = await mintWidgetToken(h.db, { userId: "owner", workspaceId: "default", now });
    expect(expiresAt - now).toBe(WIDGET_TOKEN_TTL_MS);
    expect(await verifyWidgetToken(h.db, token, "default", expiresAt - 1)).toBe("owner");
    expect(await verifyWidgetToken(h.db, token, "default", expiresAt + 1)).toBeNull();
    // Minting later clears the user's expired rows.
    await mintWidgetToken(h.db, { userId: "owner", workspaceId: "default", now: expiresAt + 1 });
    expect(await h.db.select().from(schema.widgetToken)).toHaveLength(1);
  });

  it("can be revoked one at a time", async () => {
    const a = await mintWidgetToken(h.db, { userId: "owner", workspaceId: "default" });
    const b = await mintWidgetToken(h.db, { userId: "owner", workspaceId: "default" });
    await revokeWidgetToken(h.db, a.token);
    expect(await verifyWidgetToken(h.db, a.token, "default")).toBeNull();
    expect(await verifyWidgetToken(h.db, b.token, "default")).toBe("owner");
  });

  it("reject anything that is not a widget token", async () => {
    expect(await verifyWidgetToken(h.db, "", "default")).toBeNull();
    expect(await verifyWidgetToken(h.db, "oh_api_key_shape", "default")).toBeNull();
    expect(await verifyWidgetToken(h.db, "ohw_" + "x".repeat(200), "default")).toBeNull();
  });

  it("go when the user is deleted", async () => {
    const { token } = await mintWidgetToken(h.db, { userId: "owner", workspaceId: "default" });
    await h.db.delete(schema.user).where(eq(schema.user.id, "owner"));
    expect(await verifyWidgetToken(h.db, token, "default")).toBeNull();
  });
});

describe("where a widget token is accepted", () => {
  beforeEach(async () => {
    h.db = await freshDb();
    await seed(h.db);
  });

  it("is ignored by the session every dashboard and admin function uses", async () => {
    const { token } = await mintWidgetToken(h.db, { userId: "owner", workspaceId: "default" });
    const ctx = await getSessionContext(req({ [WIDGET_TOKEN_HEADER]: token }));
    expect(ctx.user).toBeNull();
    // The old path: the token as a bearer credential is no session either.
    expect((await getSessionContext(req({ authorization: `Bearer ${token}` }))).user).toBeNull();
  });

  it("signs in the widget's functions, as a visitor even for an admin", async () => {
    const { token } = await mintWidgetToken(h.db, { userId: "owner", workspaceId: "default" });
    const ctx = await getWidgetSessionContext(req({ [WIDGET_TOKEN_HEADER]: token }));
    expect(ctx.user?.id).toBe("owner");
    expect(ctx.user?.role).toBe("member");
    expect(ctx.workspace.id).toBe("default");
  });

  it("is refused when expired, revoked or minted elsewhere", async () => {
    const elsewhere = await mintWidgetToken(h.db, { userId: "owner", workspaceId: "other" });
    expect((await getWidgetSessionContext(req({ [WIDGET_TOKEN_HEADER]: elsewhere.token }))).user).toBeNull();
    const old = await mintWidgetToken(h.db, { userId: "owner", workspaceId: "default", now: Date.now() - WIDGET_TOKEN_TTL_MS - 1 });
    expect((await getWidgetSessionContext(req({ [WIDGET_TOKEN_HEADER]: old.token }))).user).toBeNull();
    const gone = await mintWidgetToken(h.db, { userId: "owner", workspaceId: "default" });
    await revokeWidgetToken(h.db, gone.token);
    expect((await getWidgetSessionContext(req({ [WIDGET_TOKEN_HEADER]: gone.token }))).user).toBeNull();
  });

  it("does not borrow the cookie when a token is present", async () => {
    const ctx = await getWidgetSessionContext(req({ [WIDGET_TOKEN_HEADER]: "ohw_bogus", cookie: "session=owner" }));
    expect(ctx.user).toBeNull();
    // Without a token the widget falls back to the first-party cookie, unchanged.
    expect((await getWidgetSessionContext(req({ cookie: "session=owner" }))).user?.role).toBe("admin");
  });

  it("only on the widget's own server functions", () => {
    // Every server function whose middleware accepts a widget token. Adding
    // one here is a decision: it must be something a visitor may do.
    const WIDGET_FUNCTIONS = ["addComment", "createPost", "getPost", "getRoadmap", "listChangelog", "listPosts", "searchPosts", "toggleVote", "widgetUser"];
    const found: string[] = [];
    for (const file of readdirSync(FUNCTIONS).filter((f) => f.endsWith(".ts"))) {
      const src = readFileSync(FUNCTIONS + file, "utf8");
      for (const chunk of src.split(/\n(?=export const )/)) {
        if (!chunk.includes("widgetSessionMiddleware]")) continue;
        found.push(/^export const (\w+)/.exec(chunk)![1]!);
        expect(chunk, `${file} gates an admin action behind the widget middleware`).not.toMatch(/requireAdmin|assertNotDemo/);
      }
    }
    expect(found.sort()).toEqual(WIDGET_FUNCTIONS);
  });

  it("no longer rides on a global bearer plugin", () => {
    const auth = readFileSync(new URL("../../../../packages/auth/src/index.ts", import.meta.url), "utf8");
    expect(auth).not.toMatch(/\bbearer\b/);
  });
});

describe("the popup's answer", () => {
  const origin = "https://acme.openheard.com";
  const popup = {} as Window;
  const stranger = {} as Window;
  const nonce = newNonce();
  const msg = (over: Partial<{ origin: string; source: unknown; data: unknown }> = {}) =>
    ({ origin, source: popup, data: { type: MSG.session, token: "ohw_t", nonce }, ...over }) as Pick<MessageEvent, "origin" | "source" | "data">;

  it("is taken from the popup this attempt opened, with its nonce", () => {
    expect(sessionFromMessage(msg(), { popup, nonce }, origin)).toBe("ohw_t");
  });

  it("is refused from any other window, even on our origin", () => {
    expect(sessionFromMessage(msg({ source: stranger }), { popup, nonce }, origin)).toBeNull();
  });

  it("is refused with the wrong nonce or none", () => {
    expect(sessionFromMessage(msg({ data: { type: MSG.session, token: "ohw_t", nonce: newNonce() } }), { popup, nonce }, origin)).toBeNull();
    expect(sessionFromMessage(msg({ data: { type: MSG.session, token: "ohw_t" } }), { popup, nonce }, origin)).toBeNull();
  });

  it("is refused from another origin", () => {
    expect(sessionFromMessage(msg({ origin: "https://evil.example" }), { popup, nonce }, origin)).toBeNull();
  });

  it("is ignored once the attempt was cancelled", () => {
    expect(sessionFromMessage(msg(), { popup: null, nonce: null }, origin)).toBeNull();
  });

  it("uses a fresh nonce each time", () => {
    expect(newNonce()).toMatch(/^[0-9a-f]{32}$/);
    expect(newNonce()).not.toBe(newNonce());
  });
});

describe("who may frame the widget", () => {
  it("is any site until the workspace lists some", () => {
    expect(frameAncestors(null)).toBe("frame-ancestors *");
    expect(frameAncestors("")).toBe("frame-ancestors *");
  });

  it("is the workspace's own list, plus ourselves for the settings preview", () => {
    expect(frameAncestors("https://app.acme.com https://*.acme.dev")).toBe("frame-ancestors 'self' https://app.acme.com https://*.acme.dev");
    expect(frameAncestors("http://localhost:3000")).toBe("frame-ancestors 'self' http://localhost:3000");
  });

  it("accepts origins as people paste them and refuses anything else", () => {
    expect(parseEmbedOrigins("https://App.acme.com/\n https://app.acme.com, http://localhost:5173")).toEqual({
      origins: ["https://app.acme.com", "http://localhost:5173"],
      invalid: [],
    });
    const bad = parseEmbedOrigins("https://acme.com/path javascript:alert(1) acme.com * https://a.com;script-src 'none'");
    expect(bad.origins).toEqual([]);
    expect(bad.invalid).toHaveLength(6);
  });

  it("follows the workspace the request is for", async () => {
    h.db = await freshDb();
    await seed(h.db);
    const widget = new Request("http://localhost/widget", { headers: { host: "localhost" } });
    expect(await frameAncestorsFor(widget)).toBe("frame-ancestors *");
    await h.db.update(schema.workspace).set({ widgetOrigins: "https://app.acme.com" }).where(eq(schema.workspace.id, "default"));
    expect(await frameAncestorsFor(widget)).toBe("frame-ancestors 'self' https://app.acme.com");
    // The other workspace's list is its own.
    await h.db.update(schema.workspace).set({ widgetOrigins: "https://other.example" }).where(eq(schema.workspace.id, "other"));
    expect(await frameAncestorsFor(widget)).toBe("frame-ancestors 'self' https://app.acme.com");
  });

  it("fails closed when the workspace cannot be read", async () => {
    h.db = null as unknown as Db;
    expect(await frameAncestorsFor(new Request("http://localhost/widget", { headers: { host: "localhost" } }))).toBe("frame-ancestors 'self'");
  });

  it("never lets a stored value inject another directive", () => {
    expect(frameAncestors("https://a.com;script-src *")).toBe("frame-ancestors *");
  });
});

describe("widget metadata at the edge", () => {
  it("caches one copy per workspace, whatever the query string", () => {
    expect(edgeCacheKey(new URL("https://acme.openheard.com/widget.json?cb=1"))).toBe("https://acme.openheard.com/widget.json");
    expect(edgeCacheKey(new URL("https://acme.openheard.com/widget.json?cb=2&x=y"))).toBe("https://acme.openheard.com/widget.json");
    expect(edgeCacheKey(new URL("http://localhost:3001/widget.json?ws=acme&cb=3"))).toBe("http://localhost:3001/widget.json?ws=acme");
    expect(edgeCacheKey(new URL("https://acme.openheard.com/?q=1"))).toBe("https://acme.openheard.com/?q=1");
  });
});
