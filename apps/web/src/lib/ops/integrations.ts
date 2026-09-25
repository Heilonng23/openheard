import { board, integration } from "@openheard/db";
import { INTEGRATION_EVENTS, type IntegrationEvent, type IntegrationKind } from "@openheard/db/schema/integrations";
import { and, asc, eq } from "drizzle-orm";

import { assertNotDemo } from "@/lib/demo";
import { allowLocal, deliver, recordDelivery, seal, unseal } from "@/lib/integration-db";
import { type AlertEvent, checkIntegrationUrl, newSigningSecret, ownedBoards, parseList, urlHint } from "@/lib/integrations";

import { type OpCtx, OpError } from "./context";

// Slack, Discord and signed webhooks. One destination per kind.

function validUrl(kind: IntegrationKind, raw: string, local: boolean): string {
  const check = checkIntegrationUrl(kind, raw, { allowLocal: local });
  if (!check.ok) throw new OpError(check.error);
  return check.url;
}

export async function listIntegrations(ctx: OpCtx) {
  assertNotDemo(ctx.workspace);
  const ws = ctx.workspace.id;
  const [rows, boards] = await Promise.all([
    ctx.db.select().from(integration).where(eq(integration.workspaceId, ws)),
    ctx.db.select({ id: board.id, name: board.name }).from(board).where(eq(board.workspaceId, ws)).orderBy(asc(board.position)),
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
}

// Empty `url` keeps the saved one. A plain webhook gets a signing secret the
// first time; it is returned once and never again.
export async function saveIntegration(ctx: OpCtx, data: { kind: IntegrationKind; url?: string; events: IntegrationEvent[]; boardIds: string[] | null; enabled?: boolean }) {
  assertNotDemo(ctx.workspace);
  const { db } = ctx;
  const ws = ctx.workspace.id;
  const bad = data.events.filter((e) => !INTEGRATION_EVENTS.includes(e));
  if (bad.length) throw new OpError(`Unknown event '${bad[0]}'; events are: ${INTEGRATION_EVENTS.join(", ")}`);
  const [existing] = await db.select().from(integration).where(and(eq(integration.workspaceId, ws), eq(integration.kind, data.kind))).limit(1);
  const raw = data.url?.trim() ?? "";
  if (!existing && !raw) throw new OpError("Paste a webhook URL first");
  const boardIds = data.boardIds?.length
    ? ownedBoards(
        data.boardIds,
        (await db.select({ id: board.id }).from(board).where(eq(board.workspaceId, ws))).map((b) => b.id),
      )
    : null;
  const url = raw ? validUrl(data.kind, raw, await allowLocal()) : null;
  const freshSecret = data.kind === "webhook" && !existing?.secretEnc ? newSigningSecret() : null;
  const values = {
    events: JSON.stringify([...new Set(data.events)]),
    boardIds: boardIds ? JSON.stringify(boardIds) : null,
    enabled: data.enabled ?? true,
    ...(url ? { urlEnc: await seal(url), urlHint: urlHint(url), lastStatus: null, lastError: null, lastAt: null } : {}),
    ...(freshSecret ? { secretEnc: await seal(freshSecret) } : {}),
  };
  if (existing) {
    await db.update(integration).set(values).where(eq(integration.id, existing.id));
  } else {
    await db.insert(integration).values({ id: crypto.randomUUID(), workspaceId: ws, kind: data.kind, urlEnc: values.urlEnc!, urlHint: values.urlHint!, ...values });
  }
  return { kind: data.kind, created: !existing, secret: freshSecret };
}

export async function deleteIntegration(ctx: OpCtx, kind: IntegrationKind) {
  assertNotDemo(ctx.workspace);
  const gone = await ctx.db
    .delete(integration)
    .where(and(eq(integration.workspaceId, ctx.workspace.id), eq(integration.kind, kind)))
    .returning({ id: integration.id });
  return { disconnected: kind, existed: gone.length > 0 };
}

// Sends a sample message to `url`, or to the saved one when it is empty.
// Only a send to the saved URL updates its delivery status.
export async function testIntegration(ctx: OpCtx, kind: IntegrationKind, rawUrl = "") {
  assertNotDemo(ctx.workspace);
  const { db } = ctx;
  const ws = ctx.workspace;
  const [saved] = await db.select().from(integration).where(and(eq(integration.workspaceId, ws.id), eq(integration.kind, kind))).limit(1);
  const raw = rawUrl.trim();
  if (!raw && !saved) throw new OpError(`No ${kind} connection yet. Connect one first, or pass a URL to test.`);
  const url = raw ? validUrl(kind, raw, await allowLocal()) : await unseal(saved!.urlEnc);
  const secret = saved?.secretEnc ? await unseal(saved.secretEnc) : null;
  const event: AlertEvent = {
    type: "post.created",
    test: true,
    workspace: { id: ws.id, name: ws.name },
    boardId: null,
    url: `${ctx.origin}/`,
    title: `Alerts from ${ws.name} are connected`,
    author: ctx.actor?.name ?? ws.name,
    status: null,
    votes: null,
    at: new Date().toISOString(),
  };
  const result = await deliver(kind, url, secret, event);
  if (saved && !raw) await recordDelivery(db, saved.id, result);
  return result;
}
