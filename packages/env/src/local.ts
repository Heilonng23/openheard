// Stand-in for `cloudflare:workers` outside workerd (bun run dev:local, tests,
// a contributor's laptop). Vite aliases the module here when OPENHEARD_LOCAL=1.
// It provides the same env shape as the Worker, with a SQLite file in place of
// the D1 binding. Nothing in this file ever reaches the Worker bundle.
import { createClient } from "@libsql/client";
import * as schema from "@openheard/db/schema/index";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/libsql";

if (typeof window === "undefined") config({ path: new URL("../../../apps/web/.env", import.meta.url).pathname });

const url = process.env.DATABASE_URL ?? "file:./local.db";

// Just enough of an R2 bucket for image uploads: files on disk under
// apps/web/.local-uploads, content type in a sidecar next to each one.
const uploadsDir = new URL("../../../apps/web/.local-uploads/", import.meta.url);
type LocalObject = { body: ReadableStream; size: number; httpEtag: string; httpMetadata: { contentType?: string } };

function localBucket() {
  const fs = () => import("node:fs/promises");
  const file = (key: string) => {
    if (!/^[a-z0-9-]+\/[A-Za-z0-9_-]+$/.test(key)) throw new Error(`Bad upload key: ${key}`);
    return new URL(key, uploadsDir);
  };
  return {
    async put(key: string, value: ArrayBuffer | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }) {
      const { mkdir, writeFile } = await fs();
      const path = file(key);
      await mkdir(new URL(".", path), { recursive: true });
      await writeFile(path, new Uint8Array(value));
      await writeFile(new URL(`${key}.json`, uploadsDir), JSON.stringify(opts?.httpMetadata ?? {}));
    },
    async get(key: string): Promise<LocalObject | null> {
      const { readFile } = await fs();
      try {
        const bytes = await readFile(file(key));
        const httpMetadata = JSON.parse(await readFile(new URL(`${key}.json`, uploadsDir), "utf8"));
        return { body: new Blob([bytes]).stream(), size: bytes.byteLength, httpEtag: `"${key.split("/")[1]}"`, httpMetadata };
      } catch {
        return null;
      }
    },
    async list(opts?: { cursor?: string }) {
      const { readdir, stat } = await fs();
      if (opts?.cursor) return { objects: [], truncated: false };
      const names = await readdir(uploadsDir, { recursive: true }).catch(() => [] as string[]);
      const keys = names.map((n) => n.split("\\").join("/")).filter((n) => n.includes("/") && !n.endsWith(".json"));
      const objects = await Promise.all(keys.map(async (key) => ({ key, uploaded: (await stat(new URL(key, uploadsDir))).mtime })));
      return { objects, truncated: false };
    },
    async delete(keys: string | string[]) {
      const { rm } = await fs();
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        await rm(file(key), { force: true });
        await rm(new URL(`${key}.json`, uploadsDir), { force: true });
      }
    },
  };
}

// The Email binding's shape: each message is logged and written to
// apps/web/.local-emails as an .html file you can open in a browser.
function localMailbox() {
  const dir = new URL("../../../apps/web/.local-emails/", import.meta.url);
  let n = 0;
  return {
    async send(m: { to: string; subject: string; html: string; text: string }) {
      const { mkdir, writeFile } = await import("node:fs/promises");
      await mkdir(dir, { recursive: true });
      const name = `${Date.now()}-${++n}-${m.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}.html`;
      await writeFile(new URL(name, dir), m.html);
      console.log(`[email] local: ${m.subject} -> ${m.to}\n  ${m.text.replace(/\n/g, "\n  ")}\n  saved apps/web/.local-emails/${name}`);
      return { messageId: name };
    },
  };
}

// The Rate Limiting binding's shape, counted in memory per process.
function localLimiter(limit: number, periodSeconds: number) {
  const hits = new Map<string, { count: number; resets: number }>();
  return {
    async limit({ key }: { key: string }) {
      const now = Date.now();
      let entry = hits.get(key);
      if (!entry || now >= entry.resets) hits.set(key, (entry = { count: 0, resets: now + periodSeconds * 1000 }));
      entry.count++;
      return { success: entry.count <= limit };
    },
  };
}

export const env = {
  ...process.env,
  DB: undefined,
  DB_LOCAL: typeof window === "undefined" ? drizzle(createClient({ url }), { schema }) : undefined,
  EMAIL: typeof window === "undefined" ? localMailbox() : undefined,
  UPLOADS: typeof window === "undefined" ? localBucket() : undefined,
  UPLOAD_USER_LIMIT: localLimiter(10, 60),
  UPLOAD_IP_LIMIT: localLimiter(30, 60),
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  // Workspaces live on subdomains of this. *.localhost resolves to loopback in every browser.
  ROOT_DOMAIN: process.env.ROOT_DOMAIN ?? "localhost",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me-please-32chars",
} as unknown as Env & { DB_LOCAL: ReturnType<typeof drizzle> };
