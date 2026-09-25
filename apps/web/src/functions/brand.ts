import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { purgeWorkspaceCache } from "@/lib/cache";
import { isDemo } from "@/lib/demo";
import { adminOps } from "@/lib/ops/session";
import { applyBrand as applyBrandOp, assertMatchAllowed, matchBrand as matchBrandOp } from "@/lib/ops/workspace";
import { requireAdmin, sessionMiddleware } from "@/lib/session";

export const matchBrand = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ url: z.string().trim().min(3).max(200) }).parse(d))
  .handler(async ({ data, context }) => matchBrandOp(adminOps(context), data.url));

// Applies the parts of a match the admin kept.
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
    const { logoSkipped } = await applyBrandOp(adminOps(context), data);
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
