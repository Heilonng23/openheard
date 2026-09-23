import { createFileRoute } from "@tanstack/react-router";

const ID = /^[A-Za-z0-9_-]{16,32}$/;

const notFound = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain", "cache-control": "no-store" } });

// Serves an attached image. The object key starts with the workspace the host
// names, so another board's image does not resolve here whatever id is asked
// for. Images on internal notes are for the team only.
export const Route = createFileRoute("/uploads/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!ID.test(params.id)) return notFound();
        const [{ workspaceSlugFromRequest, getSessionContext }, { createDb, attachment, comment }, { uploadsBucket, objectKey }, { and, eq }] = await Promise.all([
          import("@/lib/session"),
          import("@openheard/db"),
          import("@/lib/attachment-db"),
          import("drizzle-orm"),
        ]);
        const workspaceId = await workspaceSlugFromRequest(request);
        const [row] = await createDb()
          .select({ key: attachment.key, contentType: attachment.contentType, internal: comment.internal })
          .from(attachment)
          .leftJoin(comment, eq(comment.id, attachment.commentId))
          .where(and(eq(attachment.id, params.id), eq(attachment.workspaceId, workspaceId)))
          .limit(1);
        if (!row || row.key !== objectKey(workspaceId, params.id)) return notFound();
        if (row.internal) {
          const { user } = await getSessionContext(request);
          if (user?.role !== "admin") return notFound();
        }

        const headers: Record<string, string> = {
          "content-type": row.contentType,
          "cache-control": `${row.internal ? "private" : "public"}, max-age=31536000, immutable`,
          "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'none'; sandbox",
          "content-disposition": "inline",
          etag: `"${params.id}"`,
        };
        // Ids are never reused, so a cached copy is always current.
        if (request.headers.get("if-none-match") === headers.etag) return new Response(null, { status: 304, headers });

        const object = await uploadsBucket()?.get(row.key);
        if (!object) return notFound();
        return new Response(object.body, { headers: { ...headers, "content-length": String(object.size) } });
      },
    },
  },
});
