// Sign in as whoever Cloudflare Access already authenticated. When openheard
// sits behind an Access application, every request carries a signed JWT in
// Cf-Access-Jwt-Assertion. With CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD set we
// verify it against the team's public keys and turn its email into a normal
// Better Auth session, so there is no second login screen. Unset, the header
// is ignored entirely.
import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { revokeUnprovenAccountAccess } from "better-auth/db";

export const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";

export type AccessConfig = { teamDomain: string; aud: string };

export type AccessIdentity = { email: string; sub: string };

type Jwk = JsonWebKey & { kid?: string };

// Clock skew allowed on exp/nbf, in seconds.
const LEEWAY = 60;
const CERTS_TTL_MS = 60 * 60 * 1000;
// An unknown kid is worth one refetch, but not one per junk token: inside this
// window a token whose kid we still do not know is simply rejected.
const FORCED_REFETCH_MIN_MS = 60 * 1000;

const certsCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();

// "barrows.cloudflareaccess.com", with or without scheme or trailing slash.
export function normalizeTeamDomain(raw: string): string {
  return raw.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
}

export function accessConfigFrom(env: { CF_ACCESS_TEAM_DOMAIN?: string; CF_ACCESS_AUD?: string }): AccessConfig | null {
  const teamDomain = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN ?? "");
  const aud = (env.CF_ACCESS_AUD ?? "").trim();
  return teamDomain && aud ? { teamDomain, aud } : null;
}

function b64urlBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(s: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
}

async function teamKeys(teamDomain: string, fetchImpl: typeof fetch, force: boolean, now: number): Promise<Jwk[]> {
  const hit = certsCache.get(teamDomain);
  if (hit) {
    const age = now - hit.fetchedAt;
    if (force ? age < FORCED_REFETCH_MIN_MS : age < CERTS_TTL_MS) return hit.keys;
  }
  const res = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs fetch failed: ${res.status}`);
  const { keys } = (await res.json()) as { keys?: Jwk[] };
  const list = Array.isArray(keys) ? keys : [];
  certsCache.set(teamDomain, { keys: list, fetchedAt: now });
  return list;
}

// The identity in a valid Access token, or null for anything else: bad
// signature, wrong audience or issuer, expired, or a service token (no email).
export async function verifyAccessJwt(
  token: string,
  config: AccessConfig,
  opts: { fetch?: typeof fetch; now?: number } = {},
): Promise<AccessIdentity | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts as [string, string, string];

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = b64urlJson(h);
    payload = b64urlJson(p);
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;

  const fetchImpl = opts.fetch ?? fetch;
  const nowMs = opts.now ?? Date.now();
  let jwk = (await teamKeys(config.teamDomain, fetchImpl, false, nowMs)).find((k) => k.kid === header.kid);
  // Access rotates keys; an unknown kid is worth one refetch.
  if (!jwk) jwk = (await teamKeys(config.teamDomain, fetchImpl, true, nowMs)).find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!valid) return null;

  const now = Math.floor(nowMs / 1000);
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== `https://${config.teamDomain}`) return null;
  if (!aud.includes(config.aud)) return null;
  if (typeof payload.exp !== "number" || payload.exp + LEEWAY < now) return null;
  if (typeof payload.nbf === "number" && payload.nbf - LEEWAY > now) return null;
  if (typeof payload.email !== "string" || !payload.email.includes("@")) return null;

  return { email: payload.email.toLowerCase(), sub: typeof payload.sub === "string" ? payload.sub : "" };
}

// Server-only endpoint: never routed over HTTP, only reachable through
// auth.api from the session middleware. Same find-or-create as a magic link,
// since Access has already proven the mailbox. The Access identity outranks
// whatever session cookie the browser sends: a matching one is kept as is, any
// other user's is revoked first, so a shared browser cannot keep acting as the
// person who signed in before.
export function cloudflareAccess(config: AccessConfig | null) {
  return {
    id: "cloudflare-access",
    endpoints: {
      signInCloudflareAccess: createAuthEndpoint(
        "/cloudflare-access/sign-in",
        { method: "GET", requireHeaders: true, metadata: { SERVER_ONLY: true } },
        async (ctx) => {
          const token = ctx.headers?.get(ACCESS_JWT_HEADER);
          const identity = config && token ? await verifyAccessJwt(token, config) : null;
          if (!identity) return ctx.json(null);

          const current = await getSessionFromCtx(ctx);
          if (current) {
            if (current.user.email.toLowerCase() === identity.email) return ctx.json(current);
            await ctx.context.internalAdapter.deleteSession(current.session.token);
          }

          let user = await ctx.context.internalAdapter.findUserByEmail(identity.email).then((r) => r?.user);
          if (!user) {
            user = await ctx.context.internalAdapter.createUser(
              { email: identity.email, emailVerified: true, name: identity.email.split("@")[0] ?? "" },
              { method: "cloudflare-access" },
            );
          } else if (!user.emailVerified) {
            // A password signup nobody confirmed carries no proof it belongs to
            // this mailbox. Strip it before handing the verified owner a session.
            user = (await revokeUnprovenAccountAccess(ctx, user.id)) ?? undefined;
          }
          if (!user) return ctx.json(null);

          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) return ctx.json(null);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ session, user });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

type AccessAuth = {
  api: {
    signInCloudflareAccess: (o: { headers: Headers }) => Promise<unknown>;
    getSession: (o: { headers: Headers }) => Promise<unknown>;
  };
};
type SessionOf<A extends AccessAuth> = Awaited<ReturnType<A["api"]["getSession"]>>;

// The session behind this request. With an Access assertion present the
// Access identity decides: a valid one signs its owner in, keeping their own
// session and replacing anyone else's. Without one, or when it does not
// verify, the session cookie stands on its own.
export async function sessionForRequest<A extends AccessAuth>(auth: A, headers: Headers): Promise<SessionOf<A>> {
  if (headers.get(ACCESS_JWT_HEADER)) {
    try {
      const viaAccess = (await auth.api.signInCloudflareAccess({ headers })) as SessionOf<A>;
      if (viaAccess) return viaAccess;
    } catch (err: any) {
      console.error("[auth] cloudflare access sign-in failed:", err?.message ?? err);
    }
  }
  return (await auth.api.getSession({ headers })) as SessionOf<A>;
}
