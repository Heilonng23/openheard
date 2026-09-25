// Fetches a page a user named without letting them point the Worker at
// anything private: http(s) on the default port only, no internal names,
// every address the name resolves to must be public, and each redirect hop
// is checked the same way. Time and size are capped.

export class BlockedUrlError extends Error {}

export type Resolver = (host: string) => Promise<string[]>;

export type SafeFetchOptions = {
  maxBytes: number;
  timeoutMs: number;
  maxRedirects?: number;
  // Over the cap: keep the first maxBytes (a page's head is what we read) or fail.
  truncate?: boolean;
  accept?: string;
  fetchImpl?: typeof fetch;
  resolve?: Resolver;
};

export type SafeResponse = { url: string; status: number; contentType: string; bytes: Uint8Array };

const USER_AGENT = "Mozilla/5.0 (compatible; openheard-brand/1.0; +https://openheard.com)";

function v4Private(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

// Eight 16-bit groups, or null when it does not parse.
function v6Groups(ip: string): number[] | null {
  let s = ip.replace(/^\[|\]$/g, "").toLowerCase();
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const p = v4[1].split(".").map(Number);
    s = s.slice(0, -v4[1].length) + ((p[0] << 8) | p[1]).toString(16) + ":" + ((p[2] << 8) | p[3]).toString(16);
  }
  const [head, tail, extra] = s.split("::");
  if (extra !== undefined) return null;
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : null;
  const groups = t ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

export function isPrivateAddress(ip: string): boolean {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return v4Private(ip);
  const g = v6Groups(ip);
  if (!g) return true;
  const embeddedV4 = () => `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  if (g.slice(0, 7).every((x) => x === 0)) return true; // :: and ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4Private(embeddedV4()); // v4-mapped
  if (g[0] === 0x64 && g[1] === 0xff9b) return v4Private(embeddedV4()); // NAT64
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00 || (g[0] === 0x2001 && g[1] === 0x0db8) || g[0] === 0x100;
}

const INTERNAL_SUFFIX = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|home\.arpa)$/;

// Throws unless the URL is one we may fetch. Returns the host to resolve, or
// null when the host is already a (public) address.
export function checkUrl(raw: string): { url: URL; host: string | null } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("That is not a web address");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedUrlError("Only http and https addresses work");
  if (url.username || url.password) throw new BlockedUrlError("Addresses with a login in them are not fetched");
  if (url.port) throw new BlockedUrlError("Only the standard web ports are fetched");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateAddress(host)) throw new BlockedUrlError("That address is private");
    return { url, host: null };
  }
  if (!host.includes(".") || INTERNAL_SUFFIX.test(host)) throw new BlockedUrlError("That address is private");
  return { url, host };
}

// DNS over HTTPS, so the check sees the same public DNS the fetch will.
export const dohResolve: Resolver = async (host) => {
  const ask = async (type: "A" | "AAAA") => {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error("dns");
    const body = (await res.json()) as { Answer?: { type: number; data: string }[] };
    return (body.Answer ?? []).filter((a) => a.type === 1 || a.type === 28).map((a) => a.data);
  };
  const [a, aaaa] = await Promise.all([ask("A"), ask("AAAA").catch(() => [])]);
  return [...a, ...aaaa];
};

async function assertPublic(raw: string, resolve: Resolver): Promise<URL> {
  const { url, host } = checkUrl(raw);
  if (!host) return url;
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new BlockedUrlError("Could not look up that address");
  }
  if (!addresses.length) throw new BlockedUrlError("That address does not exist");
  if (addresses.some(isPrivateAddress)) throw new BlockedUrlError("That address is private");
  return url;
}

async function readCapped(body: ReadableStream<Uint8Array> | null, max: number, truncate: boolean): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.byteLength > max) {
      await reader.cancel().catch(() => {});
      if (!truncate) throw new BlockedUrlError("That file is too large");
      parts.push(value.subarray(0, max - total));
      total = max;
      break;
    }
    parts.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

export async function safeFetch(raw: string, opts: SafeFetchOptions): Promise<SafeResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const resolve = opts.resolve ?? dohResolve;
  const signal = AbortSignal.timeout(opts.timeoutMs);
  let current = raw;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const url = await assertPublic(current, resolve);
    const res = await fetchImpl(url.href, { redirect: "manual", signal, headers: { "user-agent": USER_AGENT, accept: opts.accept ?? "*/*" } });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!location) throw new BlockedUrlError("The site redirected nowhere");
      current = new URL(location, url).href;
      continue;
    }
    const declared = Number(res.headers.get("content-length") ?? "");
    if (!opts.truncate && declared > opts.maxBytes) {
      await res.body?.cancel().catch(() => {});
      throw new BlockedUrlError("That file is too large");
    }
    const bytes = await readCapped(res.body, opts.maxBytes, !!opts.truncate);
    return { url: url.href, status: res.status, contentType: res.headers.get("content-type") ?? "", bytes };
  }
  throw new BlockedUrlError("Too many redirects");
}
