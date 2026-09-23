import { createFileRoute } from "@tanstack/react-router";

import { MAX_IMAGE_BYTES } from "@/lib/attachments";
import { isDemo } from "@/lib/demo";

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

// Reads at most `max` bytes, so a client that lies about (or omits) its
// content-length still cannot make the Worker buffer more than that.
async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

// One image per request, the raw file as the body. Any signed-in user of the
// workspace the host names: guests may comment even where only the team may
// post, and createPost still refuses them. The upload stays unclaimed until the
// post or comment it belongs to is published.
export const Route = createFileRoute("/api/uploads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin uploads are not allowed" }, 403);

        const { getSessionContext } = await import("@/lib/session");
        const { user, workspace } = await getSessionContext(request);
        if (!user) return json({ error: "Sign in to attach images" }, 401);
        if (isDemo(workspace)) return json({ error: "Image uploads are off in the demo" }, 403);

        const { uploadAllowed } = await import("@/lib/rate-limit");
        if (!(await uploadAllowed(user.id, request.headers.get("cf-connecting-ip")))) return json({ error: "Too many uploads. Try again in a minute." }, 429, { "retry-after": "60" });

        const declared = Number(request.headers.get("content-length") ?? "");
        if (declared > MAX_IMAGE_BYTES) return json({ error: "Images can be up to 5 MB." }, 413);
        const bytes = await readCapped(request, MAX_IMAGE_BYTES);
        if (!bytes) return json({ error: "Images can be up to 5 MB." }, 413);
        if (!bytes.byteLength) return json({ error: "That file is empty." }, 400);

        const [{ createDb }, { storeUpload, UploadError }] = await Promise.all([import("@openheard/db"), import("@/lib/attachment-db")]);
        try {
          const attachment = await storeUpload(createDb(), { workspaceId: workspace.id, uploaderId: user.id, bytes });
          return json({ attachment }, 201);
        } catch (err) {
          if (err instanceof UploadError) return json({ error: err.message }, err.status);
          throw err;
        }
      },
    },
  },
});
