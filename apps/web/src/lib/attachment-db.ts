// Storing, claiming and deleting image attachments. Server only: it pulls in
// the database and the R2 binding, so routes reach it through a dynamic import.
import { attachment, type Db } from "@openheard/db";
import { env } from "@openheard/env/server";
import { and, eq, inArray, isNull, lt, type SQL } from "drizzle-orm";

import { MAX_IMAGE_BYTES, MAX_IMAGES, imageSize, sniffImageType, toAttachmentView } from "./attachments";

type StoredObject = { body: ReadableStream; size: number; httpEtag: string; httpMetadata?: { contentType?: string } };
export type UploadsBucket = {
  put(key: string, value: ArrayBuffer | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<StoredObject | null>;
  delete(keys: string | string[]): Promise<void>;
  list(opts?: { cursor?: string; limit?: number }): Promise<{ objects: { key: string; uploaded: Date }[]; truncated: boolean; cursor?: string }>;
};

// The R2 binding on the Worker, a folder on disk under OPENHEARD_LOCAL.
export function uploadsBucket(): UploadsBucket | null {
  return (env as unknown as { UPLOADS?: UploadsBucket }).UPLOADS ?? null;
}

// Random, URL-safe, 128 bits: an id nobody guesses.
function newId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const objectKey = (workspaceId: string, id: string) => `${workspaceId}/${id}`;

export class UploadError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Checks the bytes, not the claimed type, then writes the object and an
// unclaimed row. The post or comment it was pasted into claims it on publish.
export async function storeUpload(db: Db, input: { workspaceId: string; uploaderId: string; bytes: Uint8Array }) {
  const bucket = uploadsBucket();
  if (!bucket) throw new UploadError(503, "Image uploads are not set up on this server");
  if (input.bytes.byteLength > MAX_IMAGE_BYTES) throw new UploadError(413, "Images can be up to 5 MB.");
  const type = sniffImageType(input.bytes);
  if (!type) throw new UploadError(415, "That file is not a PNG, JPEG, GIF or WebP image.");
  const size = imageSize(input.bytes, type);
  const id = newId();
  const key = objectKey(input.workspaceId, id);
  await bucket.put(key, input.bytes, { httpMetadata: { contentType: type } });
  const [row] = await db
    .insert(attachment)
    .values({ id, workspaceId: input.workspaceId, uploaderId: input.uploaderId, key, contentType: type, size: input.bytes.byteLength, width: size?.width ?? null, height: size?.height ?? null })
    .returning();
  return toAttachmentView(row!);
}

// Attaches the caller's own unclaimed uploads to a post or a comment. Anything
// else in `ids` (someone else's, already used, another workspace) is ignored.
export async function claimAttachments(db: Db, ids: string[], owner: { workspaceId: string; uploaderId: string }, target: { postId: number } | { commentId: number }) {
  const unique = [...new Set(ids)].slice(0, MAX_IMAGES);
  if (!unique.length) return;
  await db
    .update(attachment)
    .set(target)
    .where(
      and(
        inArray(attachment.id, unique),
        eq(attachment.workspaceId, owner.workspaceId),
        eq(attachment.uploaderId, owner.uploaderId),
        isNull(attachment.postId),
        isNull(attachment.commentId),
      ),
    );
}

// Deletes the objects first, then the rows, so a failure leaves a row that the
// next sweep retries rather than an object nothing points at.
export async function removeAttachments(db: Db, where: SQL) {
  const rows = await db.select({ id: attachment.id, key: attachment.key }).from(attachment).where(where);
  if (!rows.length) return 0;
  const bucket = uploadsBucket();
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    if (bucket) await bucket.delete(chunk.map((r) => r.key));
    await db.delete(attachment).where(inArray(attachment.id, chunk.map((r) => r.id)));
  }
  return rows.length;
}

// Uploads nobody published: pasted into a composer that was then closed.
export function sweepUnclaimed(db: Db, olderThan = 24 * 60 * 60 * 1000) {
  return removeAttachments(db, and(isNull(attachment.postId), isNull(attachment.commentId), lt(attachment.createdAt, new Date(Date.now() - olderThan)))!);
}

// Objects whose row is gone. Posts, boards and workspaces cascade their rows
// away in the database, which cannot reach into the bucket, so the nightly
// run deletes what is left behind. Fresh objects are skipped: their row may
// be a moment behind the write.
export async function sweepOrphans(db: Db, olderThan = 24 * 60 * 60 * 1000) {
  const bucket = uploadsBucket();
  if (!bucket) return 0;
  const cutoff = Date.now() - olderThan;
  let cursor: string | undefined;
  let removed = 0;
  do {
    const page = await bucket.list({ cursor, limit: 1000 });
    cursor = page.truncated ? page.cursor : undefined;
    const old = page.objects.filter((o) => new Date(o.uploaded).getTime() < cutoff);
    if (!old.length) continue;
    const known = new Set<string>();
    for (let i = 0; i < old.length; i += 90) {
      const keys = old.slice(i, i + 90).map((o) => o.key);
      for (const r of await db.select({ key: attachment.key }).from(attachment).where(inArray(attachment.key, keys))) known.add(r.key);
    }
    const gone = old.map((o) => o.key).filter((k) => !known.has(k));
    if (gone.length) await bucket.delete(gone);
    removed += gone.length;
  } while (cursor);
  return removed;
}
