// Starting a new workspace in its website's colours, against the real schema
// with the network swapped for a fake: the prefill fills defaults, gives way
// to a choice the admin made meanwhile, and writes nothing past its deadline.
import { createClient } from "@libsql/client";
import type { Db } from "@openheard/db";
import * as schema from "@openheard/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const bucket = vi.hoisted(() => ({
  objects: new Set<string>(),
  async put(key: string) {
    this.objects.add(key);
  },
}));
vi.mock("@openheard/env/server", () => ({ env: { UPLOADS: bucket } }));

import { prefillBrand } from "./brand-match";

const MIGRATIONS = new URL("../../../../packages/db/migrations/", import.meta.url).pathname;
const FIXTURES = new URL("./brand-fixtures/", import.meta.url).pathname;
const fixture = (name: string) => readFileSync(FIXTURES + name, "utf8");
const resolve = async () => ["93.184.216.34"];

async function freshDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(MIGRATIONS + file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  const db = drizzle(client, { schema }) as unknown as Db;
  await db.insert(schema.workspace).values({ id: "acme", name: "Acme" });
  return db;
}

function png(width: number, height: number) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

const files: Record<string, () => Response> = {
  "https://paylane.example/gb": () => new Response(fixture("payments.html"), { headers: { "content-type": "text/html" } }),
  "https://cdn.paylane.example/css/5f8c822d.css": () => new Response(fixture("payments.css")),
  "https://images.paylane.example/favicon.png?w=180&h=180": () => new Response(png(180, 180)),
};
const serve = (url: string | URL | Request) => (files[String(url)] ?? (() => new Response("", { status: 404 })))();

const brandOf = async (db: Db) => (await db.select({ accent: schema.workspace.accent, theme: schema.workspace.theme, logoUrl: schema.workspace.logoUrl }).from(schema.workspace).where(eq(schema.workspace.id, "acme")))[0];

describe("prefillBrand", () => {
  it("fills a workspace still at the defaults", async () => {
    const db = await freshDb();
    await prefillBrand("acme", "https://paylane.example/gb", { db, resolve, fetchImpl: (async (url: string) => serve(url)) as typeof fetch });
    const b = await brandOf(db);
    expect(b.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(b.theme).toBe("light");
    expect(b.logoUrl).toMatch(/^\/logo\//);
  });

  it("leaves branding the admin changed while the match ran", async () => {
    const db = await freshDb();
    const fetchImpl = (async (url: string) => {
      if (url === "https://paylane.example/gb") await db.update(schema.workspace).set({ accent: "#123456" }).where(eq(schema.workspace.id, "acme"));
      return serve(url);
    }) as typeof fetch;
    await prefillBrand("acme", "https://paylane.example/gb", { db, resolve, fetchImpl });
    expect(await brandOf(db)).toEqual({ accent: "#123456", theme: "dark", logoUrl: null });
  });

  it("cancels its fetches and writes nothing past the deadline", async () => {
    const db = await freshDb();
    const seen: string[] = [];
    const signals: AbortSignal[] = [];
    // The page arrives after the deadline and the fake ignores the abort, so
    // only the prefill's own checks keep the late result out of the database.
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen.push(url);
      if (init?.signal) signals.push(init.signal);
      await new Promise((r) => setTimeout(r, 80));
      return serve(url);
    }) as typeof fetch;
    const stored = bucket.objects.size;
    const started = Date.now();
    await prefillBrand("acme", "https://paylane.example/gb", { db, resolve, fetchImpl, timeoutMs: 30 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(signals[0]?.aborted).toBe(true);
    expect(seen).toEqual(["https://paylane.example/gb"]);
    expect(await brandOf(db)).toEqual({ accent: null, theme: "dark", logoUrl: null });
    expect(bucket.objects.size).toBe(stored);
  });
});
