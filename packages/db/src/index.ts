import { env } from "@openheard/env/server";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";

import * as schema from "./schema";

export type Db = ReturnType<typeof drizzleD1<typeof schema>>;

// D1 when the Worker binding exists, the local SQLite file otherwise (built in
// packages/env/src/local.ts, which only loads when OPENHEARD_LOCAL=1). Same
// drizzle API either way, so nothing above this line cares.
export function createDb(): Db {
  if (env.DB) return drizzleD1(env.DB, { schema });
  const local = (env as unknown as { DB_LOCAL?: Db }).DB_LOCAL;
  if (!local) throw new Error("No database: neither the D1 binding nor OPENHEARD_LOCAL is set");
  return local;
}

export * from "./schema";
