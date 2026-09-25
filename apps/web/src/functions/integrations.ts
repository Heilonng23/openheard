import { board, createDb, integration } from "@openheard/db";
import { INTEGRATION_EVENTS, INTEGRATION_KINDS } from "@openheard/db/schema/integrations";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { assertNotDemo } from "@/lib/demo";
import { deliver, recordDelivery, seal, unseal } from "@/lib/integration-db";
import { type AlertEvent, checkIntegrationUrl, newSigningSecret, parseList, urlHint } from "@/lib/integrations";
import { requireAdmin, sessionMiddleware } from "@/lib/session";

async function allowLocal(): Promise<boolean> {
  const { env } = await import("@openheard/env/server");
  return (env as unknown as { OPENHEARD_LOCAL?: string }).OPENHEARD_LOCAL === "1";
}

function validUrl(kind: (typeof INTEGRATION_KINDS)[number], raw: string, local: boolean): string {
  const check = checkIntegrationUrl(kind, raw, { allowLocal: local });
  if (!check.ok) throw new Error(check.error);
  return check.url;
}

export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    requireAdmin(context.user);
    assertNotDemo(context.workspace);
    const db = createDb();
    const ws = context.workspace.id;
    const [rows, boards] = await Promise.all([
      db.select().from(integration).where(eq(integration.workspaceId, ws)),
      db.select({ id: board.id, name: board.name }).from(board).where(eq(board.workspaceId, ws)).orderBy(asc(board.position)),
    ]);
    // The URL and signing secret never leave the server once saved.
    const integrations = rows.map((r) => ({
      kind: r.kind,
      urlHint: r.urlHint,
      events: parseList(r.events) ?? [],
      boardIds: parseList(r.boardIds),
      enabled: r.enabled,
      signed: !!r.secretEnc,
      lastStatus: r.lastStatus,
      lastError: r.lastError,
      lastAt: r.lastAt,
    }));
    return { integrations, boards };
  });

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
    requireAdmin(context.user);
    assertNotDemo(context.workspace);
    const db = createDb();
    const ws = context.workspace.id;
    const [existing] = await db.select().from(integration).where(and(eq(integration.workspaceId, ws), eq(integration.kind, data.kind))).limit(1);
    if (!existing && !data.url) throw new Error("Paste a webhook URL first");
    let boardIds: string[] | null = null;
    if (data.boardIds?.length) {
      const owned = await db.select({ id: board.id }).from(board).where(eq(board.workspaceId, ws));
      const ids = new Set(owned.map((b) => b.id));
      boardIds = [...new Set(data.boardIds)].filter((id) => ids.has(id));
      if (!boardIds.length) boardIds = null;
    }
    const url = data.url ? validUrl(data.kind, data.url, await allowLocal()) : null;
    // A plain webhook gets a signing secret the first time; it is shown once.
    const freshSecret = data.kind === "webhook" && !existing?.secretEnc ? newSigningSecret() : null;
    const values = {
      events: JSON.stringify([...new Set(data.events)]),
      boardIds: boardIds ? JSON.stringify(boardIds) : null,
      enabled: data.enabled,
      ...(url ? { urlEnc: await seal(url), urlHint: urlHint(url), lastStatus: null, lastError: null, lastAt: null } : {}),
      ...(freshSecret ? { secretEnc: await seal(freshSecret) } : {}),
    };
    if (existing) {
      await db.update(integration).set(values).where(eq(integration.id, existing.id));
    } else {
      await db.insert(integration).values({ id: crypto.randomUUID(), workspaceId: ws, kind: data.kind, urlEnc: values.urlEnc!, urlHint: values.urlHint!, ...values });
    }
    return { secret: freshSecret };
  });

export const deleteIntegration = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ kind: z.enum(INTEGRATION_KINDS) }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    assertNotDemo(context.workspace);
    await createDb()
      .delete(integration)
      .where(and(eq(integration.workspaceId, context.workspace.id), eq(integration.kind, data.kind)));
    return { ok: true };
  });

// Sends a sample message to the URL in the form, or to the saved one when the
// form is empty. Only a send to the saved URL updates its delivery status.
export const testIntegration = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ kind: z.enum(INTEGRATION_KINDS), url: z.string().trim().max(500).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const u = requireAdmin(context.user);
    assertNotDemo(context.workspace);
    const db = createDb();
    const ws = context.workspace;
    const [saved] = await db.select().from(integration).where(and(eq(integration.workspaceId, ws.id), eq(integration.kind, data.kind))).limit(1);
    if (!data.url && !saved) throw new Error("Paste a webhook URL first");
    const url = data.url ? validUrl(data.kind, data.url, await allowLocal()) : await unseal(saved!.urlEnc);
    const secret = saved?.secretEnc ? await unseal(saved.secretEnc) : null;
    const origin = new URL(getRequest().url).origin;
    const event: AlertEvent = {
      type: "post.created",
      test: true,
      workspace: { id: ws.id, name: ws.name },
      boardId: null,
      url: `${origin}/`,
      title: `Alerts from ${ws.name} are connected`,
      author: u.name,
      status: null,
      votes: null,
      at: new Date().toISOString(),
    };
    const result = await deliver(data.kind, url, secret, event);
    if (saved && !data.url) await recordDelivery(db, saved.id, result);
    return result;
  });
