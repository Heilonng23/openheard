// The Access assertion is the only thing standing between a request header and
// a session, so every rejection path runs against a real RS256 signature.
import { ACCESS_JWT_HEADER, accessConfigFrom, cloudflareAccess, verifyAccessJwt, type AccessConfig } from "@openheard/auth/cloudflare-access";
import { createKvSecondaryStorage, type KV } from "@openheard/auth/kv-secondary-storage";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const config: AccessConfig = { teamDomain: "team.cloudflareaccess.com", aud: "app-aud" };
const now = Date.UTC(2026, 8, 21, 12, 0, 0);
const sec = Math.floor(now / 1000);

let keys: CryptoKeyPair;
let otherKeys: CryptoKeyPair;
let certs: JsonWebKey[];

const rsa = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };

function b64url(bytes: Uint8Array | string) {
  const bin = typeof bytes === "string" ? bytes : String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: Record<string, unknown>, opts: { kid?: string; key?: CryptoKey; alg?: string } = {}) {
  const h = b64url(JSON.stringify({ alg: opts.alg ?? "RS256", kid: opts.kid ?? "k1" }));
  const p = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", opts.key ?? keys.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

const claims = (over: Record<string, unknown> = {}) => ({
  iss: "https://team.cloudflareaccess.com",
  aud: ["app-aud"],
  email: "Jo@Example.com",
  sub: "user-1",
  exp: sec + 3600,
  nbf: sec - 10,
  ...over,
});

let fetches = 0;
const fetchCerts = (async () => {
  fetches++;
  return new Response(JSON.stringify({ keys: certs }));
}) as unknown as typeof fetch;

const verify = (token: string, cfg = config) => verifyAccessJwt(token, cfg, { fetch: fetchCerts, now });

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey(rsa, true, ["sign", "verify"])) as CryptoKeyPair;
  otherKeys = (await crypto.subtle.generateKey(rsa, true, ["sign", "verify"])) as CryptoKeyPair;
  certs = [{ ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "k1" } as JsonWebKey];
});

describe("verifyAccessJwt", () => {
  it("returns the lower-cased email of a valid assertion", async () => {
    expect(await verify(await sign(claims()))).toEqual({ email: "jo@example.com", sub: "user-1" });
  });

  it("rejects a signature from any other key", async () => {
    expect(await verify(await sign(claims(), { key: otherKeys.privateKey }))).toBeNull();
  });

  it("rejects another Access application's audience", async () => {
    expect(await verify(await sign(claims({ aud: ["someone-else"] })))).toBeNull();
  });

  it("rejects another team's issuer", async () => {
    expect(await verify(await sign(claims({ iss: "https://evil.cloudflareaccess.com" })))).toBeNull();
  });

  it("rejects expired and not-yet-valid tokens", async () => {
    expect(await verify(await sign(claims({ exp: sec - 3600 })))).toBeNull();
    expect(await verify(await sign(claims({ nbf: sec + 3600 })))).toBeNull();
  });

  it("rejects service tokens, which carry no email", async () => {
    expect(await verify(await sign(claims({ email: undefined, common_name: "svc.access" })))).toBeNull();
  });

  it("rejects anything but RS256", async () => {
    expect(await verify(await sign(claims(), { alg: "none" }))).toBeNull();
    expect(await verify("not.a.jwt")).toBeNull();
    expect(await verify("garbage")).toBeNull();
  });

  it("refetches the keys once for an unknown kid", async () => {
    const before = fetches;
    expect(await verify(await sign(claims(), { kid: "rotated" }))).toBeNull();
    expect(fetches - before).toBe(1);
  });
});

describe("accessConfigFrom", () => {
  it("is off unless both values are set", () => {
    expect(accessConfigFrom({})).toBeNull();
    expect(accessConfigFrom({ CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com" })).toBeNull();
    expect(accessConfigFrom({ CF_ACCESS_AUD: "aud" })).toBeNull();
  });

  it("accepts the team domain with a scheme or trailing slash", () => {
    expect(accessConfigFrom({ CF_ACCESS_TEAM_DOMAIN: "https://Team.cloudflareaccess.com/", CF_ACCESS_AUD: " aud " })).toEqual({
      teamDomain: "team.cloudflareaccess.com",
      aud: "aud",
    });
  });
});

// The endpoint runs against a real Better Auth instance with the same KV
// secondary storage production uses, because the promotion helper behaves
// differently once verification values no longer live in the database.
describe("signInCloudflareAccess", () => {
  const realFetch = globalThis.fetch;

  function makeAuth() {
    const rows: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] };
    const kv = new Map<string, string>();
    const store: KV = {
      async get(key) { return kv.get(key) ?? null; },
      async put(key, value) { kv.set(key, value); },
      async delete(key) { kv.delete(key); },
    };
    const auth = betterAuth({
      database: memoryAdapter(rows),
      secondaryStorage: createKvSecondaryStorage(store),
      emailAndPassword: { enabled: true },
      secret: "test-secret-not-a-real-one-32chars",
      baseURL: "http://localhost:3000",
      plugins: [cloudflareAccess(config)],
    });
    return { auth, rows };
  }

  async function assertion(email: string) {
    const sec = Math.floor(Date.now() / 1000);
    return sign(claims({ email, exp: sec + 3600, nbf: sec - 10 }));
  }

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  beforeAll(() => {
    // The endpoint verifies with the ambient fetch, not an injected one.
    globalThis.fetch = fetchCerts;
  });

  it("promotes an unverified account without handing over its password or sessions", async () => {
    const { auth, rows } = makeAuth();
    const email = "unproven@example.com";
    const signUp = await auth.api.signUpEmail({ body: { email, password: "not-the-owners-password", name: "Unproven" } });
    const staleSession = signUp.token as string;
    const ctx = await auth.$context;

    expect(rows.account).toHaveLength(1);
    // Sessions live in KV here, not the database, so resolve them through the adapter.
    expect(await ctx.internalAdapter.findSession(staleSession)).toBeTruthy();

    globalThis.fetch = fetchCerts;
    const headers = new Headers({ [ACCESS_JWT_HEADER]: await assertion(email) });
    const result = await auth.api.signInCloudflareAccess({ headers });

    expect(result?.user.email).toBe(email);
    expect(result?.user.emailVerified).toBe(true);
    // The password account is gone, so the unproven signup cannot sign in again.
    expect(rows.account).toHaveLength(0);
    // The session it was holding is revoked, and the Access user gets a new one.
    expect(await ctx.internalAdapter.findSession(staleSession)).toBeFalsy();
    expect(result?.session.token).toBeTruthy();
    expect(result?.session.token).not.toBe(staleSession);
  });

  it("signs in a verified account without touching its accounts or sessions", async () => {
    const { auth, rows } = makeAuth();
    const email = "owner@example.com";
    await auth.api.signUpEmail({ body: { email, password: "the-owners-password", name: "Owner" } });
    const user = rows.user[0] as { id: string };
    rows.user[0] = { ...user, emailVerified: true };

    globalThis.fetch = fetchCerts;
    const headers = new Headers({ [ACCESS_JWT_HEADER]: await assertion(email) });
    const result = await auth.api.signInCloudflareAccess({ headers });

    expect(result?.user.id).toBe(user.id);
    expect(rows.account).toHaveLength(1);
  });

  it("ignores a request whose assertion does not verify", async () => {
    const { auth } = makeAuth();
    const headers = new Headers({ [ACCESS_JWT_HEADER]: "not.a.jwt" });
    expect(await auth.api.signInCloudflareAccess({ headers })).toBeNull();
  });
});
