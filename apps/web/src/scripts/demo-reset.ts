// Wipe the local demo workspace back to its seed. Same code the nightly cron
// runs in the Worker. Usage: bun run demo:reset
import { createClient } from "@libsql/client";
import { config } from "dotenv";
import type { Db } from "@openheard/db";
import * as schema from "@openheard/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";

import { resetDemoWorkspace } from "../lib/demo-db";

config({ path: new URL("../../.env", import.meta.url).pathname });

const db = drizzle(createClient({ url: process.env.DATABASE_URL ?? "file:./local.db" }), { schema }) as unknown as Db;

const { posts, entries } = await resetDemoWorkspace(db);
console.log(`demo reset: ${posts} posts, ${entries} changelog entries`);
