import { createAuth } from "@openheard/auth";
import { createFileRoute } from "@tanstack/react-router";

import { DEMO_WORKSPACE_ID } from "@/lib/demo";
import { workspaceSlugFromRequest } from "@/lib/session";

// Sign-out and every other auth call has to use the same cookie namespace the
// session was issued in, so the host decides it here too.
const handle = async (request: Request) => {
  const demo = (await workspaceSlugFromRequest(request)) === DEMO_WORKSPACE_ID;
  return createAuth({ demo }).handler(request);
};

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
