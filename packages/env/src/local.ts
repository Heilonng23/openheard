// Stand-in for `cloudflare:workers` outside workerd (bun run dev:local, tests,
// a contributor's laptop). Vite aliases the module here when OPENHEARD_LOCAL=1.
// It provides the same env shape as the Worker, with a SQLite file in place of
// the D1 binding. Nothing in this file ever reaches the Worker bundle.
import { createClient } from "@libsql/client";
import * as schema from "@openheard/db/schema/index";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/libsql";

config({ path: new URL("../../../apps/web/.env", import.meta.url).pathname });

const url = process.env.DATABASE_URL ?? "file:./local.db";

export const env = {
  ...process.env,
  DB: undefined,
  DB_LOCAL: drizzle(createClient({ url }), { schema }),
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  // Workspaces live on subdomains of this. *.localhost resolves to loopback in every browser.
  ROOT_DOMAIN: process.env.ROOT_DOMAIN ?? "localhost",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me-please-32chars",
} as unknown as Env & { DB_LOCAL: ReturnType<typeof drizzle> };
