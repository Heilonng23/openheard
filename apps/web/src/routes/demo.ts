import { createDb } from "@openheard/db";
import { createFileRoute } from "@tanstack/react-router";

import { DEMO_ADMIN_EMAIL, DEMO_WORKSPACE_ID } from "@/lib/demo";
import { demoAdminPassword, ensureDemoWorkspace } from "@/lib/demo-db";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { workspaceSlugFromRequest } from "@/lib/session";

// One click from the public demo board into its dashboard, as an admin, with
// no signup. Only ever answers on the demo workspace.
export const Route = createFileRoute("/demo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if ((await workspaceSlugFromRequest(request)) !== DEMO_WORKSPACE_ID) {
          return new Response("Not found", { status: 404 });
        }
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
        const { allowed, retryAfter } = await rateLimit(`demo-session:${ip}`, { window: 60, max: 20 });
        if (!allowed) return rateLimitResponse(retryAfter ?? 60);

        const db = createDb();
        await ensureDemoWorkspace(db);

        const { createAuth } = await import("@openheard/auth");
        const signIn = await createAuth().api.signInEmail({
          body: { email: DEMO_ADMIN_EMAIL, password: await demoAdminPassword() },
          headers: request.headers,
          asResponse: true,
        });
        if (!signIn.ok) return new Response("The demo is not available right now", { status: 503 });

        const headers = new Headers({ location: "/dashboard", "cache-control": "private, no-store" });
        for (const cookie of signIn.headers.getSetCookie()) headers.append("set-cookie", cookie);
        // Local dev has no demo subdomain, so carry the workspace in a cookie.
        const { env } = await import("@openheard/env/server");
        if ((env as unknown as { OPENHEARD_LOCAL?: string }).OPENHEARD_LOCAL === "1") {
          headers.append("set-cookie", `ws=${DEMO_WORKSPACE_ID}; Path=/; SameSite=Lax`);
        }
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
