// Reset and identity confinement, against the real schema with foreign keys
// on. These are the cases the review proved were broken, so they run against a
// real database rather than a stub.
import { createClient } from "@libsql/client";
import type { Db } from "@openheard/db";
import * as schema from "@openheard/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import { DEMO_ADMIN_ID, DEMO_WORKSPACE_ID } from "./demo";
import { ensureDemoWorkspace, resetDemoWorkspace } from "./demo-db";
import { seedUserId } from "./demo-seed";

const MIGRATIONS = new URL("../../../../packages/db/migrations/", import.meta.url).pathname;

async function freshDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(MIGRATIONS + file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  await client.execute("PRAGMA foreign_keys = ON");
  return drizzle(client, { schema }) as unknown as Db;
}

// A paying workspace that happens to touch the same global rows the demo seeds.
async function seedCustomer(db: Db) {
  await db.insert(schema.workspace).values({ id: "acme", name: "Acme Inc" });
  await db.insert(schema.status).values(schema.DEFAULT_STATUSES.map((d, i) => ({ workspaceId: "acme", ...d, position: i })));
  await db.insert(schema.user).values({ id: "acme-owner", name: "Owner", email: "owner@acme.test" });
  await db.insert(schema.membership).values({ workspaceId: "acme", userId: "acme-owner", role: "admin" });
  await db.insert(schema.board).values({ id: "acme-features", workspaceId: "acme", name: "Feature requests" });
  await db.insert(schema.tag).values({ id: "acme-api", workspaceId: "acme", name: "API" });
  const [p] = await db
    .insert(schema.post)
    .values({ workspaceId: "acme", boardId: "acme-features", authorId: "acme-owner", title: "Customer post", body: "" })
    .returning({ id: schema.post.id });
  await db.insert(schema.changelogEntry).values({ workspaceId: "acme", title: "Customer release", authorId: "acme-owner" });
  return p.id;
}

describe("resetDemoWorkspace", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
    await ensureDemoWorkspace(db);
    await resetDemoWorkspace(db);
  });

  it("leaves every row of another workspace alone", async () => {
    const postId = await seedCustomer(db);
    // The customer legitimately references a globally seeded demo account, the
    // exact case that used to cascade.
    const sarah = seedUserId(DEMO_WORKSPACE_ID, "sarah");
    await db.insert(schema.membership).values({ workspaceId: "acme", userId: sarah, role: "member" });
    await db.insert(schema.vote).values({ postId, userId: sarah });

    await resetDemoWorkspace(db);

    expect(await db.select().from(schema.post).where(eq(schema.post.workspaceId, "acme"))).toHaveLength(1);
    expect((await db.select().from(schema.post).where(eq(schema.post.id, postId)))[0]!.authorId).toBe("acme-owner");
    expect(await db.select().from(schema.board).where(eq(schema.board.workspaceId, "acme"))).toHaveLength(1);
    expect(await db.select().from(schema.tag).where(eq(schema.tag.workspaceId, "acme"))).toHaveLength(1);
    expect(await db.select().from(schema.changelogEntry).where(eq(schema.changelogEntry.workspaceId, "acme"))).toHaveLength(1);
    expect(await db.select().from(schema.membership).where(eq(schema.membership.workspaceId, "acme"))).toHaveLength(2);
    expect(await db.select().from(schema.vote).where(eq(schema.vote.postId, postId))).toHaveLength(1);
    expect(await db.select().from(schema.user).where(eq(schema.user.id, sarah))).toHaveLength(1);
  });

  it("keeps the workspace row and the shared admin, and restores its settings", async () => {
    await db.update(schema.workspace).set({ anonymousVoting: false, whoCanPost: "members", name: "Hijacked" }).where(eq(schema.workspace.id, DEMO_WORKSPACE_ID));
    await db.update(schema.user).set({ name: "Renamed" }).where(eq(schema.user.id, DEMO_ADMIN_ID));

    await resetDemoWorkspace(db);

    const [ws] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, DEMO_WORKSPACE_ID));
    expect(ws!.anonymousVoting).toBe(true);
    expect(ws!.whoCanPost).toBe("anyone");
    expect(ws!.name).toBe("Acme");
    expect((await db.select().from(schema.user).where(eq(schema.user.id, DEMO_ADMIN_ID)))[0]!.name).toBe("Demo admin");
    expect(
      await db.select().from(schema.membership).where(and(eq(schema.membership.workspaceId, DEMO_WORKSPACE_ID), eq(schema.membership.userId, DEMO_ADMIN_ID))),
    ).toHaveLength(1);
  });

  it("wipes what a visitor made and comes back to the same seed", async () => {
    const before = await db.select().from(schema.post).where(eq(schema.post.workspaceId, DEMO_WORKSPACE_ID));
    await db.insert(schema.post).values({ workspaceId: DEMO_WORKSPACE_ID, boardId: `${DEMO_WORKSPACE_ID}-bugs`, title: "Visitor noise", body: "" });
    await db.insert(schema.membership).values({ workspaceId: DEMO_WORKSPACE_ID, userId: "acme-owner-2", role: "admin" }).onConflictDoNothing().catch(() => {});

    const { posts } = await resetDemoWorkspace(db);

    const after = await db.select().from(schema.post).where(eq(schema.post.workspaceId, DEMO_WORKSPACE_ID));
    expect(after).toHaveLength(before.length);
    expect(after).toHaveLength(posts);
    expect(after.some((p) => p.title === "Visitor noise")).toBe(false);
  });

  it("refuses a workspace it did not provision", async () => {
    await db.delete(schema.membership).where(and(eq(schema.membership.workspaceId, DEMO_WORKSPACE_ID), eq(schema.membership.userId, DEMO_ADMIN_ID)));
    await expect(resetDemoWorkspace(db)).rejects.toThrow(/migration/i);
    await expect(ensureDemoWorkspace(db)).rejects.toThrow(/migration/i);
  });

  it("refuses to run against any other workspace", async () => {
    await expect(resetDemoWorkspace(db, "default")).rejects.toThrow();
  });

  it("stops rather than cascading when a cross-workspace reference already exists", async () => {
    await seedCustomer(db);
    // A post in another workspace pointing at a demo board: deleting the board
    // would take the post with it.
    await db.insert(schema.post).values({ workspaceId: "acme", boardId: `${DEMO_WORKSPACE_ID}-features`, title: "Crossed", body: "" });

    await expect(resetDemoWorkspace(db)).rejects.toThrow(/cross-workspace/i);
    expect(await db.select().from(schema.post).where(eq(schema.post.workspaceId, "acme"))).toHaveLength(2);
  });
});
