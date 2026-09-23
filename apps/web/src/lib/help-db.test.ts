// Help center search and reads against the real migrations, so the LIKE
// escaping and scoring run in SQLite rather than in a stub.
import { createClient } from "@libsql/client";
import type { Db } from "@openheard/db";
import * as schema from "@openheard/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import { helpArticleBySlug, helpCenterIndex, publishedHelpCount, searchHelpArticles } from "./help-db";

const MIGRATIONS = new URL("../../../../packages/db/migrations/", import.meta.url).pathname;

async function freshDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(MIGRATIONS + file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  await client.execute("PRAGMA foreign_keys = ON");
  return drizzle(client, { schema }) as unknown as Db;
}

async function seed(db: Db) {
  await db.insert(schema.workspace).values([{ id: "acme" }, { id: "other" }]);
  const [billing, setup] = await db
    .insert(schema.helpCollection)
    .values([
      { workspaceId: "acme", slug: "billing", title: "Billing", position: 1 },
      { workspaceId: "acme", slug: "getting-started", title: "Getting started", position: 0 },
    ])
    .returning({ id: schema.helpCollection.id });
  const article = (a: Partial<typeof schema.helpArticle.$inferInsert> & { slug: string; title: string }) => ({ workspaceId: "acme", status: "published" as const, body: "", ...a });
  await db.insert(schema.helpArticle).values([
    article({ slug: "export-csv", title: "Export your posts to CSV", body: "Open settings and choose export.", collectionId: setup!.id }),
    article({ slug: "invoices", title: "Download invoices", body: "Every invoice can be exported as a PDF from billing.", collectionId: billing!.id }),
    article({ slug: "discounts", title: "100% discount codes", body: "Codes that take the full price off.", collectionId: billing!.id }),
    article({ slug: "draft-export", title: "Export drafts", body: "Not ready.", status: "draft", collectionId: setup!.id }),
    article({ slug: "loose", title: "Contact support", body: "Write to us." }),
    { workspaceId: "other", slug: "export-csv", title: "Export for another workspace", body: "", status: "published" as const },
  ]);
}

describe("searchHelpArticles", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
    await seed(db);
  });

  it("ranks a title match above a body match", async () => {
    const hits = await searchHelpArticles(db, "acme", "export");
    expect(hits.map((h) => h.slug)).toEqual(["export-csv", "invoices"]);
    expect(hits[0]!.collection).toEqual({ slug: "getting-started", title: "Getting started" });
  });

  it("never returns drafts or another workspace's articles", async () => {
    const hits = await searchHelpArticles(db, "acme", "export drafts another");
    expect(hits.map((h) => h.slug)).not.toContain("draft-export");
    expect(hits.every((h) => h.title !== "Export for another workspace")).toBe(true);
  });

  it("treats % and _ as literal characters", async () => {
    expect((await searchHelpArticles(db, "acme", "100%")).map((h) => h.slug)).toEqual(["discounts"]);
    expect(await searchHelpArticles(db, "acme", "_")).toEqual([]);
  });

  it("asks suggestions for a stronger match", async () => {
    // "pdf" only appears in one body: fine for search, too weak to suggest.
    expect((await searchHelpArticles(db, "acme", "pdf")).map((h) => h.slug)).toEqual(["invoices"]);
    expect(await searchHelpArticles(db, "acme", "pdf", { minScore: 2 })).toEqual([]);
    expect((await searchHelpArticles(db, "acme", "How do I download my invoices?", { minScore: 2 })).map((h) => h.slug)).toEqual(["invoices"]);
  });

  it("fills a missing excerpt from the body", async () => {
    const [hit] = await searchHelpArticles(db, "acme", "invoices");
    expect(hit!.excerpt).toBe("Every invoice can be exported as a PDF from billing.");
  });

  it("returns nothing for an empty query", async () => {
    expect(await searchHelpArticles(db, "acme", "  ?! ")).toEqual([]);
  });
});

describe("help center reads", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
    await seed(db);
  });

  it("groups published articles by collection in collection order", async () => {
    const index = await helpCenterIndex(db, "acme");
    expect(index.collections.map((c) => [c.slug, c.articles.map((a) => a.slug)])).toEqual([
      ["getting-started", ["export-csv"]],
      ["billing", ["invoices", "discounts"]],
    ]);
    expect(index.uncategorised.map((a) => a.slug)).toEqual(["loose"]);
    expect(index.total).toBe(4);
    expect(await publishedHelpCount(db, "acme")).toBe(4);
  });

  it("hides drafts unless asked, and scopes slugs to the workspace", async () => {
    expect(await helpArticleBySlug(db, "acme", "draft-export")).toBeNull();
    expect((await helpArticleBySlug(db, "acme", "draft-export", { drafts: true }))?.status).toBe("draft");
    expect((await helpArticleBySlug(db, "other", "export-csv"))?.title).toBe("Export for another workspace");
  });

  it("lists the collection's other articles first as related", async () => {
    const a = await helpArticleBySlug(db, "acme", "invoices");
    // The rest of billing first, then the most helpful elsewhere.
    expect(a?.related.map((r) => r.slug)).toEqual(["discounts", "export-csv", "loose"]);
  });
});
