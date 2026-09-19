// Realistic sample data for local dev. Never runs against production.
// Usage: bun run db:seed  (needs OPENHEARD_LOCAL=1, set by the root script)
import { createClient } from "@libsql/client";
import type { Db } from "@openheard/db";
import * as schema from "@openheard/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";

import { DEMO_ADMIN_ID } from "../lib/demo";
import { seedDemoContent } from "../lib/demo-seed";

const db = drizzle(createClient({ url: process.env.DATABASE_URL ?? "file:./local.db" }), { schema }) as unknown as Db;

async function main() {
  // The demo's shared accounts are not candidates: they must never own
  // anything outside the demo workspace.
  const users = (await db.select().from(schema.user)).filter((u) => u.id !== DEMO_ADMIN_ID && !u.id.startsWith("demo-user-"));
  if (users.length === 0) {
    console.log("Sign up once in the app first (that account becomes admin), then seed.");
    process.exit(1);
  }
  const admin = users.find((u) => u.role === "admin") ?? users[0]!;
  await db.insert(schema.workspace).values({ id: "default", name: "acme" }).onConflictDoNothing();
  await db.insert(schema.membership).values({ workspaceId: "default", userId: admin.id, role: "admin" }).onConflictDoNothing();
  await db.insert(schema.status).values(schema.DEFAULT_STATUSES.map((d, i) => ({ workspaceId: "default", ...d, position: i }))).onConflictDoNothing();

  const { posts, entries } = await seedDemoContent(db, "default", admin.id);
  console.log(`seeded ${posts} posts, ${entries} changelog entries`);
}

main();
