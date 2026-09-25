import { createDb, workspace } from "@openheard/db";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { purgeWorkspaceCache } from "@/lib/cache";
import { isDemo } from "@/lib/demo";
import { invalidate } from "@/lib/kv-cache";
import { requireAdmin, sessionMiddleware } from "@/lib/session";

// Each match fetches up to a handful of files from someone else's server, so
// an account gets a few a minute and a few dozen an hour.
async function assertMatchAllowed(userId: string) {
  const { rateLimit } = await import("@/lib/rate-limit");
  const minute = await rateLimit(`brand-match:m:${userId}`, { window: 60, max: 5, failClosed: true });
  const hour = minute.allowed ? await rateLimit(`brand-match:h:${userId}`, { window: 3600, max: 30, failClosed: true }) : minute;
  if (!hour.allowed) throw new Error("Too many website matches. Try again in a minute.");
}

export const matchBrand = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ url: z.string().trim().min(3).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const u = requireAdmin(context.user);
    await assertMatchAllowed(u.id);
    const [{ matchWebsite }, { BlockedUrlError }] = await Promise.all([import("@/lib/brand-match"), import("@/lib/safe-fetch")]);
    try {
      return await matchWebsite(data.url);
    } catch (err) {
      if (err instanceof BlockedUrlError) throw new Error(err.message);
      throw new Error("Could not read that website. Check the address and try again.");
    }
  });

// Applies the parts of a match the admin kept. The logo is fetched again
// from its source and copied into our storage; nothing is hotlinked.
export const applyBrand = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(60).optional(),
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        theme: z.enum(["dark", "light"]).optional(),
        logoSrc: z.string().url().max(2000).optional(),
        removeLogo: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const u = requireAdmin(context.user);
    const ws = context.workspace;
    const set: Partial<typeof workspace.$inferInsert> = {};
    if (data.name) set.name = data.name;
    if (data.accent) set.accent = data.accent.toLowerCase();
    if (data.theme) set.theme = data.theme;
    if (data.removeLogo) set.logoUrl = null;
    let logoSkipped = false;
    if (data.logoSrc) {
      if (isDemo(ws)) logoSkipped = true;
      else {
        await assertMatchAllowed(u.id);
        const { storeLogo } = await import("@/lib/brand-match");
        const path = await storeLogo(ws.id, data.logoSrc);
        if (path) set.logoUrl = path;
        else logoSkipped = true;
      }
    }
    if (Object.keys(set).length) {
      await createDb().update(workspace).set(set).where(eq(workspace.id, ws.id));
      void invalidate(`workspace:${ws.id}`);
      purgeWorkspaceCache(new URL(getRequest().url).origin);
    }
    return { ok: true, logoSkipped };
  });

// First run on a self-hosted install: the default workspace takes on the
// site's look unless someone has already picked one.
export const prefillWorkspaceBrand = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ website: z.string().trim().url().max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const u = requireAdmin(context.user);
    const ws = context.workspace;
    if (isDemo(ws) || ws.accent || ws.logoUrl) return { ok: false };
    await assertMatchAllowed(u.id);
    const { prefillBrand } = await import("@/lib/brand-match");
    await prefillBrand(ws.id, data.website);
    purgeWorkspaceCache(new URL(getRequest().url).origin);
    return { ok: true };
  });
