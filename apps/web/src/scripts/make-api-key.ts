// Generate an API key for workspace "default" and print it.
// Usage: OPENHEARD_LOCAL=1 bun run apps/web/src/scripts/make-api-key.ts
import { createClient } from "@libsql/client";
import * as schema from "@openheard/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

const db = drizzle(createClient({ url: process.env.DATABASE_URL ?? "file:./local.db" }), { schema });

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function main() {
  const ws = "default";

  const [existing] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, ws)).limit(1);
  if (!existing) {
    console.error("Workspace 'default' not found. Run the app and sign up first, or run `bun run seed`.");
    process.exit(1);
  }

  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const key = `oh_${secret}`;
  const prefix = key.slice(0, 11);
  const hash = await sha256(key);

  await db.insert(schema.apiKey).values({
    id: crypto.randomUUID(),
    workspaceId: ws,
    name: "dev-cli",
    prefix,
    hash,
    createdBy: null,
  });

  console.log(`\nAPI key created for workspace "${ws}":\n`);
  console.log(`  ${key}\n`);
  console.log("Save this — it cannot be retrieved again.");
  console.log("Use it as: Authorization: Bearer " + key);
}

main();
