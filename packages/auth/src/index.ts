import { createDb } from "@openheard/db";
import * as schema from "@openheard/db/schema/auth";
import { DEFAULT_STATUSES, membership, status, workspace } from "@openheard/db/schema/feedback";
import { env } from "@openheard/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";

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

export function createAuth() {
  const db = createDb();
  // Browsers refuse Domain=localhost cookies, so cross-subdomain sessions only
  // apply on a real root domain. Locally you sign in per subdomain.
  const raw = (env as unknown as { ROOT_DOMAIN?: string }).ROOT_DOMAIN;
  const rootDomain = raw && raw !== "localhost" ? raw : undefined;

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: schema,
    }),
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 300,
      },
    },
    trustedOrigins: [env.BETTER_AUTH_URL, ...(raw ? [`https://*.${raw}`, `http://*.${raw}`, `http://*.${raw}:*`] : [])],
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
          // The very first account on a fresh install owns the default
          // workspace. Everyone after that is a member until an admin says
          // otherwise, or until they create their own workspace.
          before: async (u) => {
            const existing = await db.select({ id: schema.user.id }).from(schema.user).limit(1);
            return { data: { ...u, role: existing.length === 0 ? "admin" : "member" } };
          },
          after: async (u) => {
            const [ws] = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, "default")).limit(1);
            if (!ws) {
              await db.insert(workspace).values({ id: "default" }).onConflictDoNothing();
              await db.insert(status).values(DEFAULT_STATUSES.map((d, i) => ({ workspaceId: "default", ...d, position: i }))).onConflictDoNothing();
            }
            const others = await db.select({ userId: membership.userId }).from(membership).where(eq(membership.workspaceId, "default")).limit(1);
            await db
              .insert(membership)
              .values({ workspaceId: "default", userId: u.id, role: others.length === 0 ? "admin" : "member" })
              .onConflictDoNothing();
          },
        },
      },
    },
    // One cookie for every workspace subdomain in the cloud version.
    advanced: rootDomain ? { crossSubDomainCookies: { enabled: true, domain: "." + rootDomain } } : undefined,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || undefined,
    plugins: [
      tanstackStartCookies(),
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
    ],
  });
}
