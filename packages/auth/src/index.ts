import { createDb } from "@openheard/db";
import * as schema from "@openheard/db/schema/auth";
import { DEFAULT_STATUSES, membership, status, workspace } from "@openheard/db/schema/feedback";
import { env } from "@openheard/env/server";
import { betterAuth, type SecondaryStorage } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";

import { ACCESS_JWT_HEADER, accessConfigFrom, cloudflareAccess } from "./cloudflare-access";

type KV = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

function createKvSecondaryStorage(store: KV): SecondaryStorage {
  return {
    async get(key: string) {
      const raw = await store.get(key);
      if (raw === null) return null;
      try { return JSON.parse(raw); } catch { return raw; }
    },
    async getAndDelete(key: string) {
      const raw = await store.get(key);
      if (raw !== null) await store.delete(key);
      if (raw === null) return null;
      try { return JSON.parse(raw); } catch { return raw; }
    },
    async increment(key: string, ttl: number) {
      const raw = await store.get(key);
      const next = (raw ? parseInt(raw, 10) : 0) + 1;
      await store.put(key, String(next), { expirationTtl: ttl });
      return next;
    },
    async set(key: string, value: string, ttl?: number) {
      await store.put(key, value, ttl ? { expirationTtl: ttl } : { expirationTtl: 3600 });
    },
    async delete(key: string) {
      await store.delete(key);
    },
  };
}

const AUTH_FROM = { email: "hello@openheard.com", name: "openheard" };

async function authSendEmail(to: string, subject: string, html: string, text: string) {
  try {
    if ((env as any).EMAIL) {
      const result = await (env as any).EMAIL.send({ to, from: AUTH_FROM, subject, html, text });
      console.log(`[auth] email sent: ${subject} → ${to}`, result?.messageId ?? "");
    } else {
      console.log(`[auth] ${subject} → ${to}\n  ${text.replace(/\n/g, "\n  ")}`);
    }
  } catch (err: any) {
    console.error("[auth] email send failed:", err.message ?? err);
  }
}

// The demo workspace signs everyone into one shared account. Its cookies get
// their own name and stay host-only, so entering the demo cannot overwrite a
// real login that spans the root domain.
export const DEMO_COOKIE_PREFIX = "openheard-demo";

export function createAuth(opts?: { demo?: boolean }) {
  const db = createDb();
  // Browsers refuse Domain=localhost cookies, so cross-subdomain sessions only
  // apply on a real root domain. Locally you sign in per subdomain.
  const raw = (env as unknown as { ROOT_DOMAIN?: string }).ROOT_DOMAIN;
  const rootDomain = raw && raw !== "localhost" ? raw : undefined;

  const googleId = (env as unknown as { GOOGLE_CLIENT_ID?: string }).GOOGLE_CLIENT_ID;
  const googleSecret = (env as unknown as { GOOGLE_CLIENT_SECRET?: string }).GOOGLE_CLIENT_SECRET;

  const kvStore = (env as unknown as { CACHE?: KV }).CACHE;

  // The demo is one shared account; an Access identity never signs into it.
  const access = opts?.demo ? null : accessConfigFrom(env as unknown as { CF_ACCESS_TEAM_DOMAIN?: string; CF_ACCESS_AUD?: string });

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: schema,
    }),
    ...(kvStore ? { secondaryStorage: createKvSecondaryStorage(kvStore) } : {}),
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: kvStore ? "secondary-storage" : "memory",
      customRules: {
        "/sign-in/*": { window: 60, max: 5 },
        "/magic-link/*": { window: 60, max: 5 },
        "/sign-up/*": { window: 600, max: 3 },
      },
    },
    advanced: {
      ...(opts?.demo ? { cookiePrefix: DEMO_COOKIE_PREFIX } : rootDomain ? { crossSubDomainCookies: { enabled: true, domain: "." + rootDomain } } : {}),
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 300,
      },
    },
    trustedOrigins: [env.BETTER_AUTH_URL, ...(raw ? [`https://*.${raw}`, `http://*.${raw}`, `http://*.${raw}:*`] : [])],
    ...(googleId && googleSecret
      ? { socialProviders: { google: { clientId: googleId, clientSecret: googleSecret } } }
      : {}),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        await authSendEmail(
          user.email,
          "Reset your password",
          `<p>Click to reset your password. Expires in 1 hour.</p><p><a href="${url}">${url}</a></p>`,
          `Reset your password: ${url}`,
        );
      },
    },
    user: {
      additionalFields: {
        role: { type: "string", input: false, defaultValue: "member" },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Self-host: first account becomes admin. Cloud: always member.
          before: async (u) => {
            if (rootDomain) return { data: { ...u, role: "member" } };
            const existing = await db.select({ id: schema.user.id }).from(schema.user).limit(1);
            return { data: { ...u, role: existing.length === 0 ? "admin" : "member" } };
          },
          after: async (u) => {
            const [ws] = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, "default")).limit(1);
            if (!ws) {
              await db.insert(workspace).values({ id: "default" }).onConflictDoNothing();
              await db.insert(status).values(DEFAULT_STATUSES.map((d, i) => ({ workspaceId: "default", ...d, position: i }))).onConflictDoNothing();
            }
            const role = rootDomain
              ? "member" as const
              : (await db.select({ userId: membership.userId }).from(membership).where(eq(membership.workspaceId, "default")).limit(1)).length === 0
                ? "admin" as const
                : "member" as const;
            await db
              .insert(membership)
              .values({ workspaceId: "default", userId: u.id, role })
              .onConflictDoNothing();
          },
        },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || undefined,
    plugins: [
      cloudflareAccess(access),
      magicLink({
        sendMagicLink: async ({ email, url }, ctx?) => {
          let link = url;
          // Better Auth builds the link from baseURL (the apex). Rewrite the
          // origin to the workspace subdomain that actually made the request so
          // the verify redirect lands on the correct host.
          if (ctx?.request?.url) {
            const reqOrigin = new URL(ctx.request.url).origin;
            const baseOrigin = new URL(ctx.context.baseURL).origin;
            if (reqOrigin !== baseOrigin) {
              link = url.replace(baseOrigin, reqOrigin);
            }
          }
          await authSendEmail(
            email,
            "Your sign-in link",
            `<p>Click to sign in. Expires in 5 minutes.</p><p><a href="${link}">${link}</a></p>`,
            `Sign in: ${link}`,
          );
        },
      }),
      // Must stay last: it forwards cookies the plugins above set.
      tanstackStartCookies(),
    ],
  });
}

// Signs in the Cloudflare Access user behind this request, if Access is
// configured and the request carries a valid assertion. Null otherwise.
export async function sessionFromCloudflareAccess(auth: ReturnType<typeof createAuth>, headers: Headers) {
  if (!headers.get(ACCESS_JWT_HEADER)) return null;
  try {
    return await auth.api.signInCloudflareAccess({ headers });
  } catch (err: any) {
    console.error("[auth] cloudflare access sign-in failed:", err?.message ?? err);
    return null;
  }
}
