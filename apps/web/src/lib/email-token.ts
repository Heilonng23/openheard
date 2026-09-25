// Signed tokens for links in emails: unsubscribe and the changelog double
// opt-in. The link itself is the proof, so none of them needs a sign-in.
// Plain Web Crypto, safe in the Worker, in node and in tests.

export type EmailTokenKind = "status" | "changelog" | "confirm";
export type EmailToken = { k: EmailTokenKind; w: string; e: string; x?: number };

// Confirm links go stale; unsubscribe links work for as long as the email is
// in someone's inbox.
export const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signEmailToken(token: EmailToken, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ ...token, e: token.e.toLowerCase() })));
  return `${body}.${b64url(await hmac(secret, body))}`;
}

// Null for anything forged, malformed or expired.
export async function verifyEmailToken(raw: string, secret: string, now = Date.now()): Promise<EmailToken | null> {
  const [body, sig, extra] = raw.split(".");
  if (!body || !sig || extra !== undefined) return null;
  try {
    if (!sameBytes(fromB64url(sig), await hmac(secret, body))) return null;
    const t = JSON.parse(new TextDecoder().decode(fromB64url(body))) as EmailToken;
    if (!["status", "changelog", "confirm"].includes(t.k) || typeof t.w !== "string" || typeof t.e !== "string") return null;
    if (t.k === "confirm" && t.x === undefined) return null;
    if (t.x !== undefined && (typeof t.x !== "number" || t.x < now)) return null;
    return t;
  } catch {
    return null;
  }
}
