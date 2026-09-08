import { getSessionContext } from "@/lib/session";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/email-test")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user } = await getSessionContext(request);
        if (!user || user.role !== "admin") {
          return new Response(JSON.stringify({ error: "admin session required" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }

        const url = new URL(request.url);
        const to = url.searchParams.get("to");
        if (!to) {
          return new Response(JSON.stringify({ error: "?to= query param required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const { env } = await import("@openheard/env/server");
        const binding = (env as any).EMAIL;
        if (!binding) {
          const msg = "EMAIL binding not found — local mode or binding not configured";
          console.log("[email-test]", msg);
          return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        try {
          const result = await binding.send({
            to,
            from: { email: "hello@openheard.com", name: "openheard" },
            subject: "openheard email test",
            text: "If you see this, the EMAIL binding works.",
            html: "<p>If you see this, the <strong>EMAIL</strong> binding works.</p>",
          });
          console.log("[email-test] sent to", to, JSON.stringify(result));
          return new Response(JSON.stringify({ ok: true, to, result }), {
            headers: { "content-type": "application/json" },
          });
        } catch (err: any) {
          const detail = { message: err.message, code: err.code, name: err.name };
          console.error("[email-test] failed:", JSON.stringify(detail));
          return new Response(JSON.stringify({ error: "send failed", detail }), {
            status: 502,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
