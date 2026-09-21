// The Access assertion is the only thing standing between a request header and
// a session, so every rejection path runs against a real RS256 signature.
import { accessConfigFrom, verifyAccessJwt, type AccessConfig } from "@openheard/auth/cloudflare-access";
import { beforeAll, describe, expect, it } from "vitest";

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
