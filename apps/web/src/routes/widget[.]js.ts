import { createFileRoute } from "@tanstack/react-router";

import loader from "@/lib/widget-loader.js?raw";

// The embed script site owners paste into their app. Static, so it caches
// hard at the edge and in the browser; the workspace comes from its own URL.
export const Route = createFileRoute("/widget.js")({
  server: {
    handlers: {
      GET: () =>
        new Response(loader, {
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "public, max-age=300, s-maxage=3600",
            "access-control-allow-origin": "*",
          },
        }),
    },
  },
});
