import { createFileRoute } from "@tanstack/react-router";

// The inbox's own unsubscribe button (List-Unsubscribe-Post, RFC 8058): one
// POST with the signed token in the URL, no page, no sign-in. The link in the
// email body goes to /unsubscribe instead, which a person sees.
export const Route = createFileRoute("/api/unsubscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const t = new URL(request.url).searchParams.get("t") ?? "";
        const { applyUnsubscribe } = await import("@/lib/email-prefs");
        const res = t ? await applyUnsubscribe(t) : null;
        return new Response(res ? "Unsubscribed" : "Invalid link", { status: res ? 200 : 400, headers: { "content-type": "text/plain" } });
      },
    },
  },
});
