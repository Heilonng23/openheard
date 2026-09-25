// Generate an API key and print it.
// Usage: OPENHEARD_LOCAL=1 bun run apps/web/src/scripts/make-api-key.ts [--workspace slug] [--account email]
// --account makes an account key for that user, who must be an admin of the workspace.
import { createClient } from "@libsql/client";
import * as schema from "@openheard/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

const db = drizzle(createClient({ url: process.env.DATABASE_URL ?? "file:./local.db" }), { schema });

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const ws = arg("--workspace") ?? "default";
  const accountEmail = arg("--account");

  const [existing] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, ws)).limit(1);
  if (!existing) {
    console.error(`Workspace '${ws}' not found. Run the app and sign up first, or run \`bun run seed\`.`);
    process.exit(1);
  }

  let owner: string | null = null;
  if (accountEmail) {
    const [u] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, accountEmail.toLowerCase())).limit(1);
    if (!u) {
      console.error(`No user with email ${accountEmail}.`);
      process.exit(1);
    }
    owner = u.id;
  }

  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const key = `oh_${secret}`;
  const prefix = key.slice(0, 11);
  const hash = await sha256(key);

  await db.insert(schema.apiKey).values({
    id: crypto.randomUUID(),
    workspaceId: ws,
    name: accountEmail ? "dev-account" : "dev-cli",
    prefix,
    hash,
    scope: accountEmail ? "account" : "workspace",
    createdBy: owner,
  });

  console.log(accountEmail ? `\nAccount key created for ${accountEmail}:\n` : `\nAPI key created for workspace "${ws}":\n`);
  console.log(`  ${key}\n`);
  console.log("Save this — it cannot be retrieved again.");
  console.log("Use it as: Authorization: Bearer " + key);
}

main();
