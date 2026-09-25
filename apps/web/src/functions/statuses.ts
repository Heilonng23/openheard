import { STATUS_KINDS } from "@openheard/db/schema/feedback";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { adminOps } from "@/lib/ops/session";
import * as setup from "@/lib/ops/setup";
import { sessionMiddleware } from "@/lib/session";

export const saveStatus = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        key: z.string().optional(),
        label: z.string().trim().min(1).max(30),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        kind: z.enum(STATUS_KINDS),
        onRoadmap: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { key } = await setup.saveStatus(adminOps(context), data);
    return { key };
  });

export const deleteStatus = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ key: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await setup.deleteStatus(adminOps(context), data.key);
    return { ok: true };
  });

export const reorderStatuses = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ keys: z.array(z.string()).max(30) }).parse(d))
  .handler(async ({ data, context }) => {
    await setup.reorderStatuses(adminOps(context), data.keys);
    return { ok: true };
  });
