import { createFileRoute } from "@tanstack/react-router";

import loader from "@/lib/widget-loader.js?raw";

// The embed script site owners paste into their app. Static, so it caches
// hard at the edge and in the browser; the workspace comes from its own URL.
export const Route = createFileRoute("/widget.js")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // A subdomain with no workspace behind it has no widget to load.
        // Server-only, so imported here rather than at the top of a route.
        const { workspaceFromRequest, workspaceSlugFromRequest } = await import("@/lib/session");
        if ((await workspaceSlugFromRequest(request)) !== "default" && !(await workspaceFromRequest(request))) {
          return new Response("/* No openheard workspace at this address. */\n", {
            status: 404,
            headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
          });
        }
        return new Response(loader, {
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "public, max-age=300, s-maxage=3600",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
