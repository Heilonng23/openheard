import { defineConfig } from "drizzle-kit";

// Local SQLite file for `bun run dev` without any Cloudflare setup.
export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "sqlite",
  dbCredentials: { url: process.env.DATABASE_URL ?? "file:../../apps/web/local.db" },
});
