import { createFileRoute } from "@tanstack/react-router";

const ID = /^[A-Za-z0-9_-]{16,32}$/;

const notFound = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain", "cache-control": "no-store" } });

// Serves a workspace's logo, copied in from its website. Only the logo the
// workspace currently uses resolves; ids are never reused, so it caches forever.
export const Route = createFileRoute("/logo/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!ID.test(params.id)) return notFound();
        const [{ workspaceSlugFromRequest }, { createDb, workspace }, { uploadsBucket, objectKey }, { logoPath }, { eq }] = await Promise.all([
          import("@/lib/session"),
          import("@openheard/db"),
          import("@/lib/attachment-db"),
          import("@/lib/brand-match"),
          import("drizzle-orm"),
        ]);
        const workspaceId = await workspaceSlugFromRequest(request);
        const [row] = await createDb().select({ logoUrl: workspace.logoUrl }).from(workspace).where(eq(workspace.id, workspaceId)).limit(1);
        if (row?.logoUrl !== logoPath(params.id)) return notFound();
        const object = await uploadsBucket()?.get(objectKey(workspaceId, params.id));
        if (!object) return notFound();
        return new Response(object.body, {
          headers: {
            "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
            "content-length": String(object.size),
            "cache-control": "public, max-age=31536000, immutable",
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; sandbox",
          },
        });
      },
    },
  },
});
