// Writes that must fit D1: at most 100 bound values per statement, and a
// changelog publish that lands whole or not at all. Runs the real migrations
// on a client that refuses any statement D1 would refuse.
import { createClient, type Client } from "@libsql/client";
import type { Db } from "@openheard/db";
import * as schema from "@openheard/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openheard/env/server", () => ({ env: { BETTER_AUTH_SECRET: "test-secret-not-a-real-one-32chars", ROOT_DOMAIN: "localhost" } }));
vi.mock("@openheard/db", async () => ({ ...(await import("@openheard/db/schema/index")), createDb: () => db }));
vi.mock("@/lib/email", () => ({ sendInviteEmail: vi.fn(async () => undefined), sendEmail: vi.fn(async () => ({ ok: true })) }));
const background = vi.hoisted(() => vi.fn(async (_name: string, _fn: () => Promise<void>) => undefined));
vi.mock("@/lib/notify", async (orig) => ({ ...(await orig<object>()), inBackground: background }));

import { saveChangelog } from "./content";
import type { OpCtx } from "./context";
import { mergePosts } from "./posts";
import { Route } from "@/routes/api/v1/$";

const MIGRATIONS = new URL("../../../../../packages/db/migrations/", import.meta.url).pathname;

let db: Db;
let client: Client;

function guard(args: unknown) {
  const n = Array.isArray(args) ? args.length : args && typeof args === "object" ? Object.keys(args).length : 0;
  if (n > 100) throw new Error(`D1 would refuse a statement with ${n} bound values`);
}

async function freshDb() {
  client = createClient({ url: ":memory:" });
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(MIGRATIONS + file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  const execute = client.execute.bind(client);
  const batch = client.batch.bind(client);
  client.execute = ((stmt: { args?: unknown }) => (guard(stmt.args), execute(stmt as never))) as typeof client.execute;
  client.batch = ((stmts: { args?: unknown }[], mode?: never) => (stmts.forEach((s) => guard(s.args)), batch(stmts as never, mode))) as typeof client.batch;
  db = drizzle(client, { schema }) as unknown as Db;
}

const ann = { id: "ann", name: "Ann", email: "ann@example.com" };
const ctx = (ws = "acme"): OpCtx => ({ db, workspace: { id: ws, name: ws } as OpCtx["workspace"], actor: ann, origin: "http://localhost:3000" });
const ids = (n: number, from = 100) => Array.from({ length: n }, (_, i) => from + i);

beforeEach(async () => {
  background.mockClear();
  await freshDb();
  await db.insert(schema.user).values({ ...ann, emailVerified: true });
  await db.insert(schema.workspace).values([{ id: "acme", name: "Acme" }, { id: "beta", name: "Beta" }]);
  await db.insert(schema.membership).values([{ workspaceId: "acme", userId: "ann", role: "admin" }, { workspaceId: "beta", userId: "ann", role: "admin" }]);
  for (const ws of ["acme", "beta"]) {
    await db.insert(schema.status).values(schema.DEFAULT_STATUSES.map((s, i) => ({ workspaceId: ws, ...s, position: i })));
    await db.insert(schema.board).values({ id: `${ws}-features`, workspaceId: ws, name: "Feature requests" });
  }
  for (const id of ids(50)) await db.insert(schema.post).values({ id, workspaceId: "acme", boardId: "acme-features", title: `Post ${id}` });
});

describe("publishing a changelog", () => {
  it("ships 50 linked posts with a timeline row each and one announcement", async () => {
    const r = await saveChangelog(ctx(), { title: "Big release", postIds: ids(50), publish: true });
    expect(r.shipped.sort()).toEqual(ids(50));
    expect(r.announced).toBe(true);
    const posts = await db.select().from(schema.post);
    expect(posts.every((p) => p.status === "done")).toBe(true);
    const rows = await db.select().from(schema.activity);
    expect(rows).toHaveLength(50);
    expect(rows.every((a) => a.fromStatus === "open" && a.toStatus === "done" && a.actorId === "ann")).toBe(true);
    expect((await db.select().from(schema.changelogPost)).length).toBe(50);
    expect(background).toHaveBeenCalledTimes(1);
  });

  it("leaves nothing behind when a write fails", async () => {
    const draft = await saveChangelog(ctx(), { title: "Draft first", postIds: ids(50), publish: false });
    await client.execute("CREATE TRIGGER boom BEFORE INSERT ON activity BEGIN SELECT RAISE(ABORT, 'boom'); END");
    await expect(saveChangelog(ctx(), { id: draft.id, title: "Draft first", postIds: ids(50), publish: true })).rejects.toThrow();
    await expect(saveChangelog(ctx(), { title: "Brand new", postIds: ids(50), publish: true })).rejects.toThrow();
    const entries = await db.select().from(schema.changelogEntry);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ publishedAt: null, emailedAt: null });
    expect((await db.select().from(schema.post)).every((p) => p.status === "open")).toBe(true);
    expect(background).not.toHaveBeenCalled();
  });
});

describe("merging posts", () => {
  it("moves more votes than one insert could carry", async () => {
    const voters = Array.from({ length: 70 }, (_, i) => ({ id: `u${i}`, name: `U${i}`, email: `u${i}@example.com`, emailVerified: true }));
    for (const v of voters) await db.insert(schema.user).values(v);
    for (const v of voters) await db.insert(schema.vote).values({ postId: 100, userId: v.id });
    await db.insert(schema.vote).values({ postId: 101, userId: "u0" });
    const r = await mergePosts(ctx(), 100, 101);
    expect(r.votesAdded).toBe(69);
    expect((await db.select().from(schema.vote).where(eq(schema.vote.postId, 101))).length).toBe(70);
    const [into] = await db.select().from(schema.post).where(eq(schema.post.id, 101));
    expect(into!.voteCount).toBe(69);
  });
});

describe("GET /api/v1/posts/:id", () => {
  it("gives image links on the host of the workspace asked for", async () => {
    const key = `oh_annacct_${"x".repeat(20)}`;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))), (b) => b.toString(16).padStart(2, "0")).join("");
    await db.insert(schema.apiKey).values({ id: "annacct", workspaceId: "acme", name: "annacct", prefix: key.slice(0, 11), hash, scope: "account", createdBy: "ann" });
    await db.insert(schema.post).values({ id: 7, workspaceId: "beta", boardId: "beta-features", title: "Beta post" });
    await db.insert(schema.attachment).values({ id: "img1", workspaceId: "beta", postId: 7, key: "k", contentType: "image/png", size: 1 });
    const request = new Request("http://acme.localhost:3000/api/v1/posts/7?workspace=beta", { headers: { authorization: `Bearer ${key}` } });
    const get = (Route.options as unknown as { server: { handlers: { GET: (a: { request: Request; params: Record<string, string> }) => Promise<Response> } } }).server.handlers.GET;
    const res = await get({ request, params: { _splat: "posts/7" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { attachments: { url: string }[] };
    expect(body.attachments[0]!.url).toMatch(/^http:\/\/beta\.localhost:3000\//);
  });
});
