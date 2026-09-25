// The MCP server against the real migrations, over an in-memory transport:
// key scoping, confirm on destructive tools and a few happy paths.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createClient } from "@libsql/client";
import type { Db } from "@openheard/db";
import * as schema from "@openheard/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openheard/env/server", () => ({ env: { BETTER_AUTH_SECRET: "test-secret-not-a-real-one-32chars" } }));
vi.mock("@openheard/db", async () => ({ ...(await import("@openheard/db/schema/index")) }));
// Invite emails go nowhere in tests.
vi.mock("@/lib/email", () => ({ sendInviteEmail: vi.fn(async () => undefined), sendEmail: vi.fn(async () => ({ ok: true })) }));

import { authenticateApiKey } from "@/lib/api-auth";

import { createMcpServer } from "./server";

const MIGRATIONS = new URL("../../../../../packages/db/migrations/", import.meta.url).pathname;

async function freshDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(MIGRATIONS + file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  await client.execute("PRAGMA foreign_keys = ON");
  return drizzle(client, { schema }) as unknown as Db;
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

let db: Db;
const keys: Record<string, string> = {};

async function makeKey(name: string, workspaceId: string, scope: "workspace" | "account", createdBy: string | null) {
  const key = `oh_${name}_${"x".repeat(20)}`;
  await db.insert(schema.apiKey).values({ id: name, workspaceId, name, prefix: key.slice(0, 11), hash: await sha256(key), scope, createdBy });
  keys[name] = key;
}

async function seed() {
  await db.insert(schema.user).values([
    { id: "ann", name: "Ann", email: "ann@example.com", emailVerified: true },
    { id: "bob", name: "Bob", email: "bob@example.com", emailVerified: true },
  ]);
  await db.insert(schema.workspace).values([
    { id: "acme", name: "Acme" },
    { id: "beta", name: "Beta" },
    { id: "other", name: "Other" },
  ]);
  // Ann administers acme and beta and is only a member of other.
  await db.insert(schema.membership).values([
    { workspaceId: "acme", userId: "ann", role: "admin" },
    { workspaceId: "beta", userId: "ann", role: "admin" },
    { workspaceId: "other", userId: "ann", role: "member" },
    { workspaceId: "other", userId: "bob", role: "admin" },
  ]);
  for (const ws of ["acme", "beta", "other"]) {
    await db.insert(schema.status).values(schema.DEFAULT_STATUSES.map((s, i) => ({ workspaceId: ws, ...s, position: i })));
    await db.insert(schema.board).values({ id: `${ws}-features`, workspaceId: ws, name: "Feature requests" });
  }
  await db.insert(schema.post).values([
    { id: 1, workspaceId: "acme", boardId: "acme-features", title: "Dark mode for the dashboard", body: "Please" },
    { id: 2, workspaceId: "acme", boardId: "acme-features", title: "Dashboard dark theme", body: "Eyes hurt" },
    { id: 3, workspaceId: "other", boardId: "other-features", title: "Other workspace post", body: "" },
  ]);
  await makeKey("acmekey", "acme", "workspace", "ann");
  await makeKey("annacct", "acme", "account", "ann");
}

async function connect(key: string) {
  const request = new Request("http://localhost:3000/api/mcp", { headers: { authorization: `Bearer ${key}` } });
  const api = await authenticateApiKey(request, db);
  const server = createMcpServer(api, "http://localhost:3000");
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(b);
  return async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    const text = r.content[0]!.text;
    return { isError: !!r.isError, text, data: r.isError ? null : JSON.parse(text) };
  };
}

beforeEach(async () => {
  db = await freshDb();
  await seed();
});

describe("workspace keys", () => {
  it("act on their own workspace", async () => {
    const call = await connect(keys.acmekey!);
    const r = await call("list_posts", { sort: "new" });
    expect(r.data.posts.map((p: { id: number }) => p.id).sort()).toEqual([1, 2]);
  });

  it("can never name another workspace", async () => {
    const call = await connect(keys.acmekey!);
    for (const workspace of ["other", "beta"]) {
      const r = await call("list_posts", { workspace });
      expect(r.isError).toBe(true);
      expect(r.text).toContain("only reaches workspace 'acme'");
    }
    const write = await call("set_status", { workspace: "other", post_id: 3, status: "planned" });
    expect(write.isError).toBe(true);
    const [p] = await db.select().from(schema.post).where(eq(schema.post.id, 3));
    expect(p!.status).toBe("open");
  });

  it("cannot reach another workspace's post by id", async () => {
    const call = await connect(keys.acmekey!);
    const r = await call("set_status", { post_id: 3, status: "planned" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("Post 3 not found");
    const merge = await call("merge_posts", { from: 3, into: 1, confirm: true });
    expect(merge.isError).toBe(true);
  });

  it("cannot create workspaces", async () => {
    const call = await connect(keys.acmekey!);
    const r = await call("create_workspace", { name: "Newco board" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("account key");
  });
});

describe("account keys", () => {
  it("list and reach the workspaces their owner administers", async () => {
    const call = await connect(keys.annacct!);
    const list = await call("list_workspaces");
    expect(list.data.workspaces.map((w: { id: string }) => w.id)).toEqual(["acme", "beta", "other"]);
    const beta = await call("create_board", { workspace: "beta", name: "Bugs" });
    expect(beta.data).toMatchObject({ id: "beta-bugs", created: true });
  });

  it("refuse workspaces the owner only belongs to as a member, or not at all", async () => {
    const call = await connect(keys.annacct!);
    const member = await call("set_status", { workspace: "other", post_id: 3, status: "planned" });
    expect(member.isError).toBe(true);
    expect(member.text).toContain("not an admin of workspace 'other'");
    await db.insert(schema.workspace).values({ id: "stranger", name: "Stranger" });
    const stranger = await call("list_posts", { workspace: "stranger" });
    expect(stranger.isError).toBe(true);
    const [p] = await db.select().from(schema.post).where(eq(schema.post.id, 3));
    expect(p!.status).toBe("open");
  });

  it("stop working in a workspace once the owner loses admin there", async () => {
    const call = await connect(keys.annacct!);
    expect((await call("list_boards", { workspace: "beta" })).isError).toBe(false);
    await db.update(schema.membership).set({ role: "member" }).where(eq(schema.membership.workspaceId, "beta"));
    expect((await call("list_boards", { workspace: "beta" })).isError).toBe(true);
  });

  it("create a workspace owned by the key's owner", async () => {
    const call = await connect(keys.annacct!);
    // Free allows two, and Ann already runs acme and beta.
    const refused = await call("create_workspace", { name: "Launch pad", slug: "launchpad" });
    expect(refused.text).toContain("Free allows 2 workspaces");
    await db.update(schema.user).set({ plan: "pro" }).where(eq(schema.user.id, "ann"));
    const r = await call("create_workspace", { name: "Launch pad", slug: "launchpad" });
    expect(r.data.id).toBe("launchpad");
    const [m] = await db.select().from(schema.membership).where(eq(schema.membership.workspaceId, "launchpad"));
    expect(m).toMatchObject({ userId: "ann", role: "admin" });
    const boards = await call("list_boards", { workspace: "launchpad" });
    expect(boards.data.boards).toHaveLength(1);
  });
});

describe("destructive tools", () => {
  it("do nothing without confirm: true", async () => {
    const call = await connect(keys.acmekey!);
    for (const [name, args] of [
      ["delete_post", { id: 1 }],
      ["merge_posts", { from: 2, into: 1 }],
      ["delete_board", { board: "acme-features" }],
      ["disconnect", { kind: "slack" }],
      ["delete_status", { key: "review" }],
    ] as const) {
      const r = await call(name, { ...args });
      expect(r.isError, name).toBe(true);
      expect(r.text).toContain("confirm: true");
    }
    expect(await db.select().from(schema.post).where(eq(schema.post.workspaceId, "acme"))).toHaveLength(2);
    const [p2] = await db.select().from(schema.post).where(eq(schema.post.id, 2));
    expect(p2!.mergedIntoId).toBeNull();
  });

  it("run with confirm: true", async () => {
    const call = await connect(keys.acmekey!);
    const merged = await call("merge_posts", { from: 2, into: 1, confirm: true });
    expect(merged.data).toMatchObject({ into: 1, alreadyMerged: false });
    const again = await call("merge_posts", { from: 2, into: 1, confirm: true });
    expect(again.data.alreadyMerged).toBe(true);
    const deleted = await call("delete_post", { id: 2, confirm: true });
    expect(deleted.data).toEqual({ deleted: 2 });
  });
});

describe("happy paths", () => {
  it("boards, statuses and tags accept names and explain what exists", async () => {
    const call = await connect(keys.acmekey!);
    const bad = await call("list_posts", { board: "bugs" });
    expect(bad.text).toBe("Board 'bugs' not found; boards are: 'acme-features (Feature requests)'");
    const status = await call("create_status", { label: "Beta", kind: "progress", position: 1 });
    expect(status.data).toMatchObject({ key: "beta", created: true });
    const statuses = await call("list_statuses");
    expect(statuses.data.statuses[1].key).toBe("beta");
    const moved = await call("set_status", { post_id: 1, status: "In progress" });
    expect(moved.data).toMatchObject({ changed: true, status: "progress" });
    const same = await call("set_status", { post_id: 1, status: "progress" });
    expect(same.data.changed).toBe(false);
    const tagged = await call("update_post", { id: 1, tags: ["ui"], create_missing_tags: true, eta: "Q3", pinned: true });
    expect(tagged.data).toMatchObject({ tags: ["ui"], eta: "Q3", pinned: true });
  });

  it("finds duplicates and summarizes", async () => {
    const call = await connect(keys.acmekey!);
    const dupes = await call("find_duplicates", { post_id: 1 });
    expect(dupes.data.candidates.map((c: { id: number }) => c.id)).toEqual([2]);
    const summary = await call("summarize_feedback");
    expect(summary.data.total).toBe(2);
    expect(summary.data.byStatus.find((s: { key: string }) => s.key === "open").posts).toBe(2);
  });

  it("votes as the key's owner, once", async () => {
    const call = await connect(keys.acmekey!);
    await call("vote", { post_id: 1 });
    const again = await call("vote", { post_id: 1 });
    expect(again.data.voted).toBe(true);
    const [p] = await db.select().from(schema.post).where(eq(schema.post.id, 1));
    expect(p!.voteCount).toBe(1);
  });

  it("writes help articles and changelog entries", async () => {
    const call = await connect(keys.acmekey!);
    const col = await call("create_help_collection", { title: "Getting started", icon: "rocket" });
    const art = await call("create_help_article", { title: "How to export posts", body: "Open settings.", collection_id: col.data.id });
    expect(art.data).toMatchObject({ slug: "how-to-export-posts", status: "draft" });
    const pub = await call("publish_help_article", { id: art.data.id });
    expect(pub.data.status).toBe("published");
    const draft = await call("draft_changelog", { title: "Dark mode", body: "It is here.", post_ids: [1] });
    const published = await call("publish_changelog", { id: draft.data.id });
    expect(published.data).toMatchObject({ ok: true, alreadyPublished: false, shipped: [1] });
    const [p] = await db.select().from(schema.post).where(eq(schema.post.id, 1));
    expect(p!.status).toBe("done");
    expect((await call("publish_changelog", { id: draft.data.id })).data.alreadyPublished).toBe(true);
  });

  it("configures the widget and returns the snippet", async () => {
    const call = await connect(keys.acmekey!);
    const bad = await call("configure_widget", { accent: "blue" });
    expect(bad.isError).toBe(true);
    const r = await call("configure_widget", { theme: "light", launcher: "label", label: "Ideas", allowed_sites: ["https://acme.test"] });
    expect(r.data).toMatchObject({ theme: "light", launcher: "label", label: "Ideas", allowedSites: ["https://acme.test"] });
    const snip = await call("get_widget_snippet", { framework: "next" });
    expect(snip.data.script).toContain("/widget.js");
    expect(snip.data.example.file).toContain("app/layout.tsx");
  });

  it("lists every tool with annotations and the workflow prompts", async () => {
    const request = new Request("http://localhost:3000/api/mcp", { headers: { authorization: `Bearer ${keys.acmekey}` } });
    const server = createMcpServer(await authenticateApiKey(request, db), "http://localhost:3000");
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: "test", version: "1" });
    await client.connect(b);
    const { tools } = await client.listTools();
    const del = tools.find((t) => t.name === "delete_post")!;
    expect(del.annotations).toMatchObject({ destructiveHint: true });
    expect(tools.find((t) => t.name === "list_posts")!.annotations).toMatchObject({ readOnlyHint: true });
    for (const t of tools) expect(t.description!.length, t.name).toBeGreaterThan(20);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(["reply-to-feedback", "setup-openheard", "ship-and-announce", "weekly-triage"]);
  });
});
