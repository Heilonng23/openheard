import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { DEMO_WORKSPACE_ID } from "@/lib/demo";
import { sessionMiddleware } from "@/lib/session";

// Hands the signed session token to the widget's sign-in popup, which passes
// it to the widget iframe on the same origin. Only a same-origin page can ask,
// and only for the session its own cookie already proves.
export const widgetSessionToken = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const request = getRequest();
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin") throw new Error("Not allowed");
    if (!context.user) return { token: null };
    const { createAuth } = await import("@openheard/auth");
    const auth = createAuth({ demo: context.workspace.id === DEMO_WORKSPACE_ID });
    const name = (await auth.$context).authCookies.sessionToken.name;
    const raw = (request.headers.get("cookie") ?? "")
      .split(/;\s*/)
      .find((c) => c.startsWith(name + "="))
      ?.slice(name.length + 1);
    return { token: raw ? decodeURIComponent(raw) : null };
  });
