// A subdomain nobody has claimed: the session says "not found" with enough
// for the root route to render its 404 page, and the widget files answer 404
// instead of failing. Runs the real session.ts against an in-memory database.
import { createClient } from "@libsql/client";
import type { Db } from "@openheard/db";
import * as schema from "@openheard/db/schema/index";
import { isNotFound } from "@tanstack/react-router";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown as Db }));

vi.mock("@openheard/env/server", () => ({ env: { ROOT_DOMAIN: "openheard.com" } }));
vi.mock("@openheard/db", async () => ({ ...(await import("@openheard/db/schema/index")), createDb: () => h.db }));
vi.mock("@openheard/auth", () => ({
  createAuth: () => ({}),
  sessionForRequest: async (_auth: unknown, headers: Headers) =>
    headers.get("cookie") === "session=ann" ? { user: { id: "ann", name: "Ann", email: "ann@example.com", image: null } } : null,
}));

import { Route as WidgetJs } from "../routes/widget[.]js";
import { getSessionContext } from "./session";

const MIGRATIONS = new URL("../../../../packages/db/migrations/", import.meta.url).pathname;

async function freshDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(MIGRATIONS + file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  return drizzle(client, { schema }) as unknown as Db;
}

const req = (host: string, path = "/", cookie?: string) =>
  new Request(`https://${host}${path}`, { headers: { host, ...(cookie ? { cookie } : {}) } });

async function rejection(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected a rejection");
}

beforeEach(async () => {
  h.db = await freshDb();
  await h.db.insert(schema.workspace).values({ id: "acme", name: "Acme" });
});

describe("an unknown workspace subdomain", () => {
  it("is a not-found that names the address, never a crash", async () => {
    const e = await rejection(getSessionContext(req("feedback.openheard.com")));
    expect(isNotFound(e)).toBe(true);
    expect((e as { data: unknown }).data).toEqual({ missingWorkspace: "feedback", rootDomain: "openheard.com", signedIn: false });
  });

  it("tells a signed-in visitor they can create it", async () => {
    const e = await rejection(getSessionContext(req("feedback.openheard.com", "/", "session=ann")));
    expect((e as { data: { signedIn: boolean } }).data.signedIn).toBe(true);
  });

  it("still resolves workspaces that exist", async () => {
    const ctx = await getSessionContext(req("acme.openheard.com"));
    expect(ctx.workspace.id).toBe("acme");
  });

  it("answers widget.js with a 404", async () => {
    const get = (WidgetJs.options as unknown as { server: { handlers: { GET: (c: { request: Request }) => Promise<Response> } } }).server.handlers.GET;
    expect((await get({ request: req("feedback.openheard.com", "/widget.js") })).status).toBe(404);
    expect((await get({ request: req("acme.openheard.com", "/widget.js") })).status).toBe(200);
  });
});
