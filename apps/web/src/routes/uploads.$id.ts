import { createFileRoute } from "@tanstack/react-router";

import { isPublicImage } from "@/lib/attachments";

const ID = /^[A-Za-z0-9_-]{16,32}$/;

const notFound = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain", "cache-control": "no-store" } });

// Serves an attached image. The object key starts with the workspace the host
// names, so another board's image does not resolve here whatever id is asked
// for. Only an image on content anyone can read is public and cacheable:
// a fresh upload is its uploader's until published, an internal note is for
// the team, and a post awaiting approval is for its author and the team.
export const Route = createFileRoute("/uploads/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!ID.test(params.id)) return notFound();
        const [{ workspaceSlugFromRequest, getSessionContext }, { createDb, attachment, comment, post, status, workspace }, { uploadsBucket, objectKey }, { and, eq, sql }] = await Promise.all([
          import("@/lib/session"),
          import("@openheard/db"),
          import("@/lib/attachment-db"),
          import("drizzle-orm"),
        ]);
        const workspaceId = await workspaceSlugFromRequest(request);
        const [row] = await createDb()
          .select({
            key: attachment.key,
            contentType: attachment.contentType,
            uploaderId: attachment.uploaderId,
            claimed: sql<number>`${attachment.postId} is not null or ${attachment.commentId} is not null`,
            internal: comment.internal,
            postAuthorId: post.authorId,
            statusKind: status.kind,
            requireApproval: workspace.requireApproval,
          })
          .from(attachment)
          .leftJoin(comment, eq(comment.id, attachment.commentId))
          .leftJoin(post, eq(post.id, sql`coalesce(${attachment.postId}, ${comment.postId})`))
          .leftJoin(status, and(eq(status.workspaceId, post.workspaceId), eq(status.key, post.status)))
          .leftJoin(workspace, eq(workspace.id, attachment.workspaceId))
          .where(and(eq(attachment.id, params.id), eq(attachment.workspaceId, workspaceId)))
          .limit(1);
        if (!row || row.key !== objectKey(workspaceId, params.id)) return notFound();

        const unclaimed = !row.claimed;
        const isPublic = isPublicImage({ ...row, claimed: !unclaimed });
        if (!isPublic) {
          const { user } = await getSessionContext(request);
          const admin = user?.role === "admin";
          const allowed = unclaimed ? !!user && user.id === row.uploaderId : row.internal ? admin : admin || (!!user && user.id === row.postAuthorId);
          if (!allowed) return notFound();
        }

        const headers: Record<string, string> = {
          "content-type": row.contentType,
          // Ids are never reused, so a public copy is current forever. A private
          // one is not cached at all: its visibility can still change.
          "cache-control": isPublic ? "public, max-age=31536000, immutable" : "private, no-store",
          "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'none'; sandbox",
          "content-disposition": "inline",
          etag: `"${params.id}"`,
        };
        if (isPublic && request.headers.get("if-none-match") === headers.etag) return new Response(null, { status: 304, headers });

        const object = await uploadsBucket()?.get(row.key);
        if (!object) return notFound();
        return new Response(object.body, { headers: { ...headers, "content-length": String(object.size) } });
      },
    },
  },
});
