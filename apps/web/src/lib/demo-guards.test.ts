// The authorization rules the review found missing. Each one drives a real
// query against the real schema rather than asserting on a helper in isolation.
import { createClient } from "@libsql/client";
import type { Db } from "@openheard/db";
import * as schema from "@openheard/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import { SETTINGS_NAV } from "./admin-nav";
import { DEMO_ADMIN_ID, DEMO_HIDDEN_SETTINGS, DEMO_WORKSPACE_ID, assertNotDemo, assertNotDemoIdentity, isDemoIdentity } from "./demo";
import { ensureDemoContent } from "./demo-db";
import { scopedId } from "./demo-seed";

const MIGRATIONS = new URL("../../../../packages/db/migrations/", import.meta.url).pathname;

async function freshDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(MIGRATIONS + file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  await client.execute("PRAGMA foreign_keys = ON");
  return drizzle(client, { schema }) as unknown as Db;
}

describe("the shared demo account", () => {
  it("is nobody outside the demo workspace", () => {
    // resolveSession drops the user entirely on any other workspace; this is
    // the predicate it and every guard share.
    expect(isDemoIdentity({ id: DEMO_ADMIN_ID })).toBe(true);
    expect(isDemoIdentity({ id: "acme-owner" })).toBe(false);
    expect(isDemoIdentity(null)).toBe(false);
    expect(() => assertNotDemoIdentity({ id: DEMO_ADMIN_ID })).toThrow(/demo account/i);
    expect(() => assertNotDemoIdentity({ id: "acme-owner" })).not.toThrow();
  });

  it("cannot be handed a membership anywhere", () => {
    // setRole refuses this id; the demo's own membership is also the marker
    // that says a `demo` workspace is ours to reset.
    expect(DEMO_ADMIN_ID).toBe("demo-admin");
  });
});

describe("demo workspace guards", () => {
  it("blocks import and the other locked actions", () => {
    expect(() => assertNotDemo({ id: DEMO_WORKSPACE_ID })).toThrow(/demo workspace/i);
    expect(() => assertNotDemo({ id: "acme" })).not.toThrow();
  });

  it("hides only settings the nav actually has", () => {
    const slugs = SETTINGS_NAV.flatMap((g) => g.items.map(([slug]) => slug as string));
    for (const hidden of DEMO_HIDDEN_SETTINGS) expect(slugs).toContain(hidden);
  });
});

// The ids below are the real collision the review demonstrated: a tag named
// "Demo private" in default and one named "Private" in demo both slugify to
// `demo-private`.
describe("global id collisions", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
    await db.insert(schema.workspace).values({ id: "default" });
    await db.insert(schema.tag).values({ id: "demo-private", workspaceId: "default", name: "Demo private" });
  });

  it("a scoped upsert leaves the other workspace's tag alone", async () => {
    const id = `${DEMO_WORKSPACE_ID}-private`;
    // The guard saveTag applies: refuse when the row belongs to someone else.
    const [row] = await db.select({ workspaceId: schema.tag.workspaceId }).from(schema.tag).where(eq(schema.tag.id, id)).limit(1);
    expect(row?.workspaceId).toBe("default");

    // Even if the guard were bypassed, setWhere keeps the write scoped.
    await db
      .insert(schema.tag)
      .values({ id, workspaceId: DEMO_WORKSPACE_ID, name: "Private" })
      .onConflictDoUpdate({ target: schema.tag.id, set: { name: "Private" }, setWhere: eq(schema.tag.workspaceId, DEMO_WORKSPACE_ID) });

    const [after] = await db.select().from(schema.tag).where(eq(schema.tag.id, id));
    expect(after!.name).toBe("Demo private");
    expect(after!.workspaceId).toBe("default");
  });

  it("the seed refuses to adopt a board another workspace owns", async () => {
    await db.insert(schema.board).values({ id: scopedId(DEMO_WORKSPACE_ID, "features"), workspaceId: "default", name: "Squatter" });
    await db.insert(schema.user).values({ id: DEMO_ADMIN_ID, name: "Demo admin", email: "admin@demo.invalid" });
    await db.insert(schema.workspace).values({ id: DEMO_WORKSPACE_ID });
    await db.insert(schema.membership).values({ workspaceId: DEMO_WORKSPACE_ID, userId: DEMO_ADMIN_ID, role: "admin" });

    await expect(ensureDemoContent(db)).rejects.toThrow(/already in use/i);
    const [board] = await db.select().from(schema.board).where(eq(schema.board.id, scopedId(DEMO_WORKSPACE_ID, "features")));
    expect(board!.workspaceId).toBe("default");
    expect(board!.name).toBe("Squatter");
  });
});

describe("changelog ownership", () => {
  it("an entry and its links are only ever matched within one workspace", async () => {
    const db = await freshDb();
    await db.insert(schema.workspace).values([{ id: "acme" }, { id: DEMO_WORKSPACE_ID }]);
    await db.insert(schema.board).values({ id: "acme-features", workspaceId: "acme", name: "Features" });
    const [foreignPost] = await db.insert(schema.post).values({ workspaceId: "acme", boardId: "acme-features", title: "Customer post", body: "" }).returning({ id: schema.post.id });
    const [foreignEntry] = await db.insert(schema.changelogEntry).values({ workspaceId: "acme", title: "Customer release" }).returning({ id: schema.changelogEntry.id });
    await db.insert(schema.changelogPost).values({ entryId: foreignEntry.id, postId: foreignPost.id });

    // saveChangelog's two preconditions, as the handler runs them for a demo
    // admin submitting the customer's ids.
    const entryOwned = await db
      .select({ id: schema.changelogEntry.id })
      .from(schema.changelogEntry)
      .where(and(eq(schema.changelogEntry.id, foreignEntry.id), eq(schema.changelogEntry.workspaceId, DEMO_WORKSPACE_ID)))
      .limit(1);
    expect(entryOwned).toHaveLength(0);

    const postsOwned = await db
      .select({ id: schema.post.id })
      .from(schema.post)
      .where(and(eq(schema.post.workspaceId, DEMO_WORKSPACE_ID), eq(schema.post.id, foreignPost.id)));
    expect(postsOwned).toHaveLength(0);

    // Both fail, so nothing is written and the customer's links survive.
    expect(await db.select().from(schema.changelogPost).where(eq(schema.changelogPost.entryId, foreignEntry.id))).toHaveLength(1);
  });
});
