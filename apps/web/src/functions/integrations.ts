import { INTEGRATION_EVENTS, INTEGRATION_KINDS } from "@openheard/db/schema/integrations";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import * as ops from "@/lib/ops/integrations";
import { adminOps } from "@/lib/ops/session";
import { sessionMiddleware } from "@/lib/session";

export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => ops.listIntegrations(adminOps(context)));

const saveInput = z.object({
  kind: z.enum(INTEGRATION_KINDS),
  // Empty keeps the saved URL.
  url: z.string().trim().max(500).default(""),
  events: z.array(z.enum(INTEGRATION_EVENTS)).max(INTEGRATION_EVENTS.length),
  boardIds: z.array(z.string().max(80)).max(100).nullable(),
  enabled: z.boolean().default(true),
});

export const saveIntegration = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => saveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { secret } = await ops.saveIntegration(adminOps(context), data);
    return { secret };
  });

export const deleteIntegration = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ kind: z.enum(INTEGRATION_KINDS) }).parse(d))
  .handler(async ({ data, context }) => {
    await ops.deleteIntegration(adminOps(context), data.kind);
    return { ok: true };
  });

// Sends a sample message to the URL in the form, or to the saved one when the
// form is empty.
export const testIntegration = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ kind: z.enum(INTEGRATION_KINDS), url: z.string().trim().max(500).default("") }).parse(d))
  .handler(async ({ data, context }) => ops.testIntegration(adminOps(context), data.kind, data.url));
