// Storing, claiming and deleting image attachments. Server only: it pulls in
// the database and the R2 binding, so routes reach it through a dynamic import.
import { attachment, workspace, type Db } from "@openheard/db";
import { env } from "@openheard/env/server";
import { and, eq, inArray, isNull, like, lt, sql, type SQL } from "drizzle-orm";

import { MAX_IMAGE_BYTES, MAX_IMAGES, formatBytes, imageSize, sniffImageType, toAttachmentView } from "./attachments";

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

// What one account may upload in a rolling day, across every workspace. The
// rate limiter bounds bursts; this bounds what a steady trickle can store.
export const DAILY_UPLOAD_BYTES = 100 * 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;

// D1 refuses a query with more than 100 bound parameters.
const D1_CHUNK = 90;

// Checks the bytes, not the claimed type, then writes an unclaimed row and the
// object. The post or comment it was pasted into claims it on publish.
export async function storeUpload(db: Db, input: { workspaceId: string; uploaderId: string; bytes: Uint8Array }) {
  const bucket = uploadsBucket();
  if (!bucket) throw new UploadError(503, "Image uploads are not set up on this server");
  if (input.bytes.byteLength > MAX_IMAGE_BYTES) throw new UploadError(413, "Images can be up to 5 MB.");
  const type = sniffImageType(input.bytes);
  if (!type) throw new UploadError(415, "That file is not a PNG, JPEG, GIF or WebP image.");
  const size = imageSize(input.bytes, type);
  const id = newId();
  const key = objectKey(input.workspaceId, id);
  // The quota check and the insert are one statement, so parallel uploads
  // cannot each read the total before any of them has added to it.
  const since = Date.now() - DAY;
  const inserted = await db.all<{ id: string }>(sql`
    INSERT INTO attachment (id, workspace_id, uploader_id, key, content_type, size, width, height)
    SELECT ${id}, ${input.workspaceId}, ${input.uploaderId}, ${key}, ${type}, ${input.bytes.byteLength}, ${size?.width ?? null}, ${size?.height ?? null}
    WHERE (SELECT coalesce(sum(size), 0) FROM attachment WHERE uploader_id = ${input.uploaderId} AND created_at > ${since}) + ${input.bytes.byteLength} <= ${DAILY_UPLOAD_BYTES}
    RETURNING id
  `);
  if (!inserted.length) throw new UploadError(429, `You can upload up to ${formatBytes(DAILY_UPLOAD_BYTES)} of images a day. Try again tomorrow.`);
  try {
    await bucket.put(key, input.bytes, { httpMetadata: { contentType: type } });
  } catch (err) {
    await db.delete(attachment).where(eq(attachment.id, id));
    throw err;
  }
  return toAttachmentView({ id, contentType: type, width: size?.width ?? null, height: size?.height ?? null });
}

type Owner = { workspaceId: string; uploaderId: string };

const claimable = (ids: string[], owner: Owner) =>
  and(inArray(attachment.id, ids), eq(attachment.workspaceId, owner.workspaceId), eq(attachment.uploaderId, owner.uploaderId), isNull(attachment.postId), isNull(attachment.commentId));

export const uniqueIds = (ids: string[]) => [...new Set(ids)].slice(0, MAX_IMAGES);

export class AttachmentGoneError extends Error {
  constructor() {
    super("One of the images is no longer available. Remove it and attach it again.");
  }
}

// Called before anything is published. Every id must be the caller's own
// unclaimed upload, or it throws. Refreshing created_at takes the rows out of
// reach of the nightly sweep, so they are still there when the claim lands.
export async function reserveAttachments(db: Db, ids: string[], owner: Owner) {
  const unique = uniqueIds(ids);
  if (!unique.length) return unique;
  const held = await db.update(attachment).set({ createdAt: new Date() }).where(claimable(unique, owner)).returning({ id: attachment.id });
  if (held.length !== unique.length) throw new AttachmentGoneError();
  return unique;
}

// The claim itself, for a db.batch next to the insert of its post or comment.
// `target` may be a subquery for the id that insert produces.
export function claimQuery(db: Db, ids: string[], owner: Owner, target: { postId: number | SQL } | { commentId: number | SQL }) {
  return db.update(attachment).set(target).where(claimable(ids, owner)).returning({ id: attachment.id });
}

// Deletes the rows first, then the objects. Each delete re-checks `where`, so
// a row claimed after the sweep started is left alone; an object whose delete
// fails has no row any more and the orphan sweep takes it next time.
export async function removeAttachments(db: Db, where: SQL) {
  const bucket = uploadsBucket();
  let removed = 0;
  for (;;) {
    const rows = await db
      .delete(attachment)
      .where(and(where, inArray(attachment.id, db.select({ id: attachment.id }).from(attachment).where(where).limit(D1_CHUNK))))
      .returning({ key: attachment.key });
    if (!rows.length) return removed;
    removed += rows.length;
    if (bucket) await bucket.delete(rows.map((r) => r.key));
  }
}

// Uploads nobody published: pasted into a composer that was then closed.
export function sweepUnclaimed(db: Db, olderThan = DAY) {
  return removeAttachments(db, and(isNull(attachment.postId), isNull(attachment.commentId), lt(attachment.createdAt, new Date(Date.now() - olderThan)))!);
}

// Objects whose row is gone. Posts, boards and workspaces cascade their rows
// away in the database, which cannot reach into the bucket, so the nightly
// run deletes what is left behind. Fresh objects are skipped: their row may
// be a moment behind the write. A workspace's current logo lives in the
// same bucket with no attachment row, so it counts as known too.
export async function sweepOrphans(db: Db, olderThan = DAY) {
  const bucket = uploadsBucket();
  if (!bucket) return 0;
  const logos = await db.select({ id: workspace.id, logoUrl: workspace.logoUrl }).from(workspace).where(like(workspace.logoUrl, "/logo/%"));
  const logoKeys = new Set(logos.map((w) => objectKey(w.id, w.logoUrl!.slice("/logo/".length))));
  const cutoff = Date.now() - olderThan;
  let cursor: string | undefined;
  let removed = 0;
  do {
    const page = await bucket.list({ cursor, limit: 1000 });
    cursor = page.truncated ? page.cursor : undefined;
    const old = page.objects.filter((o) => new Date(o.uploaded).getTime() < cutoff);
    if (!old.length) continue;
    const known = new Set<string>();
    for (let i = 0; i < old.length; i += D1_CHUNK) {
      const keys = old.slice(i, i + D1_CHUNK).map((o) => o.key);
      for (const r of await db.select({ key: attachment.key }).from(attachment).where(inArray(attachment.key, keys))) known.add(r.key);
    }
    const gone = old.map((o) => o.key).filter((k) => !known.has(k) && !logoKeys.has(k));
    if (gone.length) await bucket.delete(gone);
    removed += gone.length;
  } while (cursor);
  return removed;
}
