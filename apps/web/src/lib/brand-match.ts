// Fetches a website and reads its brand, and copies a chosen logo into the
// uploads bucket so a board never hotlinks someone else's server. Server
// only: routes reach it through a dynamic import.
import type { Db } from "@openheard/db";

import { imageSize, sniffImageType } from "./attachments";
import { type BrandSuggestion, parsePage, suggestBrand } from "./brand-extract";
import { BlockedUrlError, type SafeFetchOptions, safeFetch } from "./safe-fetch";

export type BrandMatch = Omit<BrandSuggestion, "logoCandidates"> & { url: string; logo: { src: string; preview: string } | null };

const PAGE_BYTES = 1024 * 1024;
const CSS_BYTES = 1024 * 1024;
const LOGO_BYTES = 1024 * 1024;
const MAX_STYLESHEETS = 5;
const MAX_LOGO_TRIES = 3;

type Deps = Pick<SafeFetchOptions, "fetchImpl" | "resolve" | "signal">;

export function normalizeWebsite(input: string): string {
  const s = input.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
}

const text = (b: Uint8Array) => new TextDecoder().decode(b);

// A raster image we can store, with a sensible shape for a logo.
export async function fetchLogo(src: string, deps: Deps = {}): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const res = await safeFetch(src, { ...deps, maxBytes: LOGO_BYTES, timeoutMs: 4000, accept: "image/*" });
    if (res.status !== 200) return null;
    const type = sniffImageType(res.bytes);
    if (!type) return null;
    const size = imageSize(res.bytes, type);
    if (size && (size.width < 16 || size.width / size.height > 2.2 || size.height / size.width > 2.2)) return null;
    return { bytes: res.bytes, type };
  } catch {
    return null;
  }
}

export async function matchWebsite(input: string, deps: Deps = {}): Promise<BrandMatch> {
  const page = await safeFetch(normalizeWebsite(input), { ...deps, maxBytes: PAGE_BYTES, timeoutMs: 5000, truncate: true, accept: "text/html" });
  if (page.status >= 400) throw new BlockedUrlError(`The site answered ${page.status}`);
  if (page.contentType && !/html/i.test(page.contentType)) throw new BlockedUrlError("That address is not a web page");
  const info = parsePage(text(page.bytes), page.url);

  const css = await Promise.all(
    info.stylesheets.slice(0, MAX_STYLESHEETS).map((href) =>
      safeFetch(href, { ...deps, maxBytes: CSS_BYTES, timeoutMs: 4000, truncate: true, accept: "text/css" })
        .then((r) => (r.status === 200 ? text(r.bytes) : ""))
        .catch(() => ""),
    ),
  );
  const { logoCandidates, ...brand } = suggestBrand(info, css);

  let logo: BrandMatch["logo"] = null;
  for (const src of logoCandidates.slice(0, MAX_LOGO_TRIES)) {
    const got = await fetchLogo(src, deps);
    if (got) {
      logo = { src, preview: `data:${got.type};base64,${base64(got.bytes)}` };
      break;
    }
  }
  return { ...brand, url: page.url, logo };
}

function base64(b: Uint8Array) {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

// The public path a stored logo is served from, and back.
export const LOGO_PREFIX = "/logo/";
export const logoPath = (id: string) => `${LOGO_PREFIX}${id}`;

// Copies the logo into the uploads bucket under the workspace's prefix and
// returns its path, or null when there is no bucket or the image is unusable.
export async function storeLogo(workspaceId: string, src: string, deps: Deps = {}): Promise<string | null> {
  const got = await fetchLogo(src, deps);
  return got ? storeLogoBytes(workspaceId, got) : null;
}

async function storeLogoBytes(workspaceId: string, logo: { bytes: Uint8Array; type: string }): Promise<string | null> {
  const { uploadsBucket, objectKey } = await import("./attachment-db");
  const bucket = uploadsBucket();
  if (!bucket) return null;
  const b = crypto.getRandomValues(new Uint8Array(16));
  const id = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await bucket.put(objectKey(workspaceId, id), logo.bytes, { httpMetadata: { contentType: logo.type } });
  return logoPath(id);
}

const PREFILL_MS = 9000;

// New workspaces with a website start in its colours and logo. Best effort
// and bounded in time: anything that fails leaves the openheard defaults.
// Past the deadline every fetch is cancelled and nothing is written, and the
// write only lands while the branding is still at its defaults, so a choice
// the admin made meanwhile is never overwritten.
export async function prefillBrand(workspaceId: string, website: string, opts: Omit<Deps, "signal"> & { db?: Db; timeoutMs?: number } = {}): Promise<void> {
  const signal = AbortSignal.timeout(opts.timeoutMs ?? PREFILL_MS);
  try {
    const [{ createDb, workspace }, { and, eq, isNull }] = await Promise.all([import("@openheard/db"), import("drizzle-orm")]);
    const match = await matchWebsite(website, { fetchImpl: opts.fetchImpl, resolve: opts.resolve, signal });
    signal.throwIfAborted();
    const preview = match.logo?.preview.match(/^data:([^;]+);base64,(.*)$/);
    const logoUrl = preview ? await storeLogoBytes(workspaceId, { type: preview[1], bytes: Uint8Array.from(atob(preview[2]), (c) => c.charCodeAt(0)) }) : null;
    const set = { ...(match.accent ? { accent: match.accent } : {}), ...(match.theme ? { theme: match.theme } : {}), ...(logoUrl ? { logoUrl } : {}) };
    if (!Object.keys(set).length) return;
    signal.throwIfAborted();
    await (opts.db ?? createDb())
      .update(workspace)
      .set(set)
      .where(and(eq(workspace.id, workspaceId), isNull(workspace.accent), isNull(workspace.logoUrl), eq(workspace.theme, "dark")));
    const { invalidate } = await import("./kv-cache");
    await invalidate(`workspace:${workspaceId}`);
  } catch {
    // Defaults stay; Settings > Branding can match again.
  }
}
