// Sweeping, reserving and storing uploads, against the real schema. The bucket
// is a stub that records what it was asked to delete.
import { createClient } from "@libsql/client";
import type { Db } from "@openheard/db";
import * as schema from "@openheard/db/schema/index";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bucket = vi.hoisted(() => ({
  objects: new Set<string>(),
  deleted: [] as string[][],
  onDelete: null as null | (() => Promise<void>),
  async put(key: string) {
    this.objects.add(key);
  },
  async get() {
    return null;
  },
  async delete(keys: string | string[]) {
    const list = Array.isArray(keys) ? keys : [keys];
    this.deleted.push(list);
    for (const k of list) this.objects.delete(k);
    await this.onDelete?.();
  },
  async list() {
    return { objects: [], truncated: false };
  },
}));
vi.mock("@openheard/env/server", () => ({ env: { UPLOADS: bucket } }));

import { AttachmentGoneError, DAILY_UPLOAD_BYTES, UploadError, claimQuery, reserveAttachments, storeUpload, sweepOrphans, sweepUnclaimed } from "./attachment-db";

const MIGRATIONS = new URL("../../../../packages/db/migrations/", import.meta.url).pathname;
const OLD = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
const owner = { workspaceId: "acme", uploaderId: "ann" };

// The most bound parameters any single query used; D1 refuses more than 100.
let maxParams = 0;

async function freshDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(MIGRATIONS + file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  await client.execute("PRAGMA foreign_keys = ON");
  const logger = { logQuery: (_q: string, params: unknown[]) => void (maxParams = Math.max(maxParams, params.length)) };
  const db = drizzle(client, { schema, logger }) as unknown as Db;
  await db.insert(schema.workspace).values({ id: "acme", name: "Acme" });
  await db.insert(schema.user).values([
    { id: "ann", name: "Ann", email: "ann@acme.test" },
    { id: "bob", name: "Bob", email: "bob@acme.test" },
  ]);
  await db.insert(schema.board).values({ id: "features", workspaceId: "acme", name: "Features" });
  return db;
}

async function addPost(db: Db) {
  const [p] = await db.insert(schema.post).values({ workspaceId: "acme", boardId: "features", authorId: "ann", title: "A post", body: "" }).returning({ id: schema.post.id });
  return p!.id;
}

async function addUploads(db: Db, n: number, opts: { uploaderId?: string; createdAt?: Date; size?: number } = {}) {
  const rows = Array.from({ length: n }, (_, i) => {
    const id = `${opts.uploaderId ?? "ann"}${String(i).padStart(4, "0")}${Math.random().toString(36).slice(2, 12)}`;
    return { id, workspaceId: "acme", uploaderId: opts.uploaderId ?? "ann", key: `acme/${id}`, contentType: "image/png", size: opts.size ?? 100, createdAt: opts.createdAt ?? OLD };
  });
  // Inserted in slices so the fixture itself stays under the parameter limit.
  for (let i = 0; i < rows.length; i += 10) await db.insert(schema.attachment).values(rows.slice(i, i + 10));
  for (const r of rows) bucket.objects.add(r.key);
  maxParams = 0;
  return rows;
}

const remaining = async (db: Db) => (await db.select({ id: schema.attachment.id }).from(schema.attachment)).map((r) => r.id);

describe("sweepUnclaimed", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
    bucket.objects.clear();
    bucket.deleted = [];
    bucket.onDelete = null;
  });

  it("sweeps more than 100 rows without a query over D1's parameter limit", async () => {
    const rows = await addUploads(db, 230);
    expect(await sweepUnclaimed(db)).toBe(230);
    expect(await remaining(db)).toEqual([]);
    expect(bucket.objects.size).toBe(0);
    expect(bucket.deleted.flat().sort()).toEqual(rows.map((r) => r.key).sort());
    expect(Math.max(...bucket.deleted.map((d) => d.length))).toBeLessThanOrEqual(90);
    expect(maxParams).toBeLessThanOrEqual(100);
  });

  it("leaves fresh and claimed uploads alone", async () => {
    const postId = await addPost(db);
    const [fresh] = await addUploads(db, 1, { createdAt: new Date() });
    const [claimed] = await addUploads(db, 1);
    await db.update(schema.attachment).set({ postId }).where(eq(schema.attachment.id, claimed!.id));
    expect(await sweepUnclaimed(db)).toBe(0);
    expect((await remaining(db)).sort()).toEqual([fresh!.id, claimed!.id].sort());
  });

  it("does not delete a row claimed while the sweep is running", async () => {
    const postId = await addPost(db);
    const rows = await addUploads(db, 150);
    const late = rows.at(-1)!;
    // Between the first chunk and the next, a post publishes with the last upload.
    bucket.onDelete = async () => {
      bucket.onDelete = null;
      await db.update(schema.attachment).set({ postId }).where(eq(schema.attachment.id, late.id));
    };
    expect(await sweepUnclaimed(db)).toBe(149);
    expect(await remaining(db)).toEqual([late.id]);
    expect(bucket.objects.has(late.key)).toBe(true);
  });

  it("does not delete an upload reserved for a submit, and the submit fails if the sweep got there first", async () => {
    const [kept, lost] = await addUploads(db, 2);
    await reserveAttachments(db, [kept!.id], owner);
    expect(await sweepUnclaimed(db)).toBe(1);
    expect(await remaining(db)).toEqual([kept!.id]);
    await expect(reserveAttachments(db, [lost!.id], owner)).rejects.toBeInstanceOf(AttachmentGoneError);
  });
});

describe("reserveAttachments and claimQuery", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("holds every requested upload or throws", async () => {
    const [a, b] = await addUploads(db, 2);
    expect((await reserveAttachments(db, [a!.id, b!.id, a!.id], owner)).sort()).toEqual([a!.id, b!.id].sort());
    await expect(reserveAttachments(db, [a!.id, "missing-id-000000"], owner)).rejects.toBeInstanceOf(AttachmentGoneError);
  });

  it("refuses someone else's upload and one already attached", async () => {
    const postId = await addPost(db);
    const [mine] = await addUploads(db, 1);
    const [theirs] = await addUploads(db, 1, { uploaderId: "bob" });
    await expect(reserveAttachments(db, [mine!.id, theirs!.id], owner)).rejects.toBeInstanceOf(AttachmentGoneError);
    await db.update(schema.attachment).set({ postId }).where(eq(schema.attachment.id, mine!.id));
    await expect(reserveAttachments(db, [mine!.id], owner)).rejects.toBeInstanceOf(AttachmentGoneError);
  });

  it("claims in a batch and reports how many it got", async () => {
    const [first, second] = [await addPost(db), await addPost(db)];
    const rows = await addUploads(db, 2);
    const ids = rows.map((r) => r.id);
    const [claimed] = await db.batch([claimQuery(db, ids, owner, { postId: first })]);
    expect(claimed).toHaveLength(2);
    // A second submit of the same images gets none of them.
    const [again] = await db.batch([claimQuery(db, ids, owner, { postId: second })]);
    expect(again).toHaveLength(0);
    const owners = await db.select({ postId: schema.attachment.postId }).from(schema.attachment).where(inArray(schema.attachment.id, ids));
    expect(owners.every((o) => o.postId === first)).toBe(true);
    // A post with no images runs the same batch with an empty claim.
    const [none] = await db.batch([claimQuery(db, [], owner, { postId: second })]);
    expect(none).toHaveLength(0);
  });
});

describe("storeUpload", () => {
  const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
    bucket.objects.clear();
  });

  it("stores the row and the object", async () => {
    const view = await storeUpload(db, { ...owner, bytes: PNG });
    expect(view.contentType).toBe("image/png");
    expect(await remaining(db)).toEqual([view.id]);
    expect(bucket.objects.has(`acme/${view.id}`)).toBe(true);
  });

  it("refuses an upload past the daily byte quota, and counts only the last day", async () => {
    await addUploads(db, 1, { size: DAILY_UPLOAD_BYTES - 10, createdAt: new Date() });
    await expect(storeUpload(db, { ...owner, bytes: PNG })).rejects.toMatchObject({ status: 429 } satisfies Partial<UploadError>);
    expect(bucket.objects.size).toBe(1);
    // Someone else's allowance is their own.
    await expect(storeUpload(db, { workspaceId: "acme", uploaderId: "bob", bytes: PNG })).resolves.toBeTruthy();
  });

  it("lets yesterday's uploads fall out of the quota", async () => {
    await addUploads(db, 1, { size: DAILY_UPLOAD_BYTES, createdAt: OLD });
    await expect(storeUpload(db, { ...owner, bytes: PNG })).resolves.toBeTruthy();
  });
});

describe("sweepOrphans", () => {
  it("deletes objects with no row but keeps the logo each workspace uses", async () => {
    const db = await freshDb();
    const [kept] = await addUploads(db, 1);
    await db.update(schema.workspace).set({ logoUrl: "/logo/currentLogo0123456789" }).where(eq(schema.workspace.id, "acme"));
    const keys = [kept.key, "acme/currentLogo0123456789", "acme/oldLogo0123456789ab", "acme/strayUpload012345678"];
    const list = bucket.list;
    bucket.list = async () => ({ objects: keys.map((key) => ({ key, uploaded: OLD })), truncated: false }) as never;
    bucket.deleted = [];
    try {
      expect(await sweepOrphans(db)).toBe(2);
    } finally {
      bucket.list = list;
    }
    expect(bucket.deleted.flat().sort()).toEqual(["acme/oldLogo0123456789ab", "acme/strayUpload012345678"]);
  });
});

describe("attachment indexes", () => {
  const plan = async (db: Db, query: ReturnType<typeof sql>) => (await db.all<{ detail: string }>(sql`explain query plan ${query}`)).map((r) => r.detail).join("\n");

  it("looks keys up for the orphan sweep and sums the daily quota without scanning the table", async () => {
    const db = await freshDb();
    expect(await plan(db, sql`select key from attachment where key in ('acme/a', 'acme/b')`)).toContain("attachment_key_idx");
    expect(await plan(db, sql`select coalesce(sum(size), 0) from attachment where uploader_id = 'ann' and created_at > 0`)).toContain("attachment_uploader_created_idx");
  });
});
