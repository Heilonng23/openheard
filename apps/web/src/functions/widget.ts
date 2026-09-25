import { createDb, workspace } from "@openheard/db";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { purgeWorkspaceCache } from "@/lib/cache";
import { assertNotDemo } from "@/lib/demo";
import { invalidate } from "@/lib/kv-cache";
import { requireAdmin, sessionMiddleware, widgetSessionMiddleware } from "@/lib/session";
import { WIDGET_TOKEN_HEADER } from "@/lib/widget-auth";
import { MAX_EMBED_ORIGINS, parseEmbedOrigins } from "@/lib/widget-origins";
import { widgetSettingsSchema } from "@/lib/widget-settings";
import { mintWidgetToken, revokeWidgetToken } from "@/lib/widget-token";

// Mints a widget token for the sign-in popup, which passes it to the widget
// iframe on the same origin. Only a same-origin page can ask, and only on the
// strength of the session cookie: a widget token cannot mint another.
export const connectWidget = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const request = getRequest();
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin") throw new Error("Not allowed");
    // Browsers without Sec-Fetch-Site still send Origin on a POST.
    const origin = request.headers.get("origin");
    if (!site && origin && origin !== new URL(request.url).origin) throw new Error("Not allowed");
    if (!context.user) return { token: null };
    return mintWidgetToken(createDb(), { userId: context.user.id, workspaceId: context.workspace.id });
  });

// Who the panel is signed in as: the widget token's user, or the cookie's
// when the host page shares our site.
export const widgetUser = createServerFn({ method: "GET" })
  .middleware([widgetSessionMiddleware])
  .handler(async ({ context }) => context.user);

// Revokes the widget token the request carries: on sign-out, and for the old
// token once the popup has handed over a new one.
export const disconnectWidget = createServerFn({ method: "POST" }).handler(async () => {
  const token = getRequest().headers.get(WIDGET_TOKEN_HEADER);
  if (token) await revokeWidgetToken(createDb(), token);
  return { ok: true };
});

export const saveWidgetOrigins = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => z.object({ origins: z.string().max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    // The demo's widget has to keep working for everyone who tries it.
    assertNotDemo(context.workspace);
    const { origins, invalid } = parseEmbedOrigins(data.origins);
    if (invalid.length) throw new Error(`Not an origin: ${invalid[0]}`);
    if (origins.length > MAX_EMBED_ORIGINS) throw new Error(`At most ${MAX_EMBED_ORIGINS} sites`);
    await createDb()
      .update(workspace)
      .set({ widgetOrigins: origins.length ? origins.join(" ") : null })
      .where(eq(workspace.id, context.workspace.id));
    void invalidate(`workspace:${context.workspace.id}`);
    return { origins };
  });

// Appearance and tabs. The loader picks them up from /widget.json, so the
// edge copy goes as soon as they change.
export const saveWidgetSettings = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((d: unknown) => widgetSettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    requireAdmin(context.user);
    await createDb().update(workspace).set({ widgetSettings: data }).where(eq(workspace.id, context.workspace.id));
    void invalidate(`workspace:${context.workspace.id}`);
    await purgeWorkspaceCache(new URL(getRequest().url).origin);
    return data;
  });
