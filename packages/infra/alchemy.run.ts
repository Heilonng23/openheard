import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { config } from "dotenv";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });

export const db = Cloudflare.D1.Database("database", {
  // flat .sql copies; drizzle-kit's own out dir (src/migrations) has meta/ which Alchemy rejects
  migrations: "../../packages/db/migrations",
});

export const cache = Cloudflare.KV.Namespace("CACHE");

export const email = Cloudflare.Email.SendEmail("EMAIL");

// Images attached to posts and comments. Private: the Worker serves them.
export const uploads = Cloudflare.R2.Bucket("UPLOADS");

// Upload bursts, per account and per address. The daily byte quota lives in D1.
export const uploadUserLimit = Cloudflare.RateLimit("UPLOAD_USER_LIMIT", { namespaceId: 1101, simple: { limit: 10, period: 60 } });
export const uploadIpLimit = Cloudflare.RateLimit("UPLOAD_IP_LIMIT", { namespaceId: 1102, simple: { limit: 30, period: 60 } });

export const web = Cloudflare.Website.Vite("web", {
  rootDir: "../../apps/web",
  placement: { region: "aws:us-west-2" },
  compatibility: {
    flags: ["nodejs_compat"],
  },
  // Wipes the public demo workspace back to its seed, 04:00 UTC.
  crons: ["0 4 * * *"],
  env: {
    DB: db,
    CACHE: cache,
    EMAIL: email,
    UPLOADS: uploads,
    UPLOAD_USER_LIMIT: uploadUserLimit,
    UPLOAD_IP_LIMIT: uploadIpLimit,
    BETTER_AUTH_SECRET: Config.redacted("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: Config.string("BETTER_AUTH_URL").pipe(Config.withDefault("")),
    ROOT_DOMAIN: Config.string("ROOT_DOMAIN").pipe(Config.withDefault("")),
    EMAIL_FROM: Config.string("EMAIL_FROM").pipe(Config.withDefault("")),
    EMAIL_FROM_NAME: Config.string("EMAIL_FROM_NAME").pipe(Config.withDefault("")),
    EMAIL_REPLY_TO: Config.string("EMAIL_REPLY_TO").pipe(Config.withDefault("")),
    GOOGLE_CLIENT_ID: Config.string("GOOGLE_CLIENT_ID").pipe(Config.withDefault("")),
    GOOGLE_CLIENT_SECRET: Config.string("GOOGLE_CLIENT_SECRET").pipe(Config.withDefault("")),
    CF_ACCESS_TEAM_DOMAIN: Config.string("CF_ACCESS_TEAM_DOMAIN").pipe(Config.withDefault("")),
    CF_ACCESS_AUD: Config.string("CF_ACCESS_AUD").pipe(Config.withDefault("")),
    STRIPE_SECRET_KEY: Config.string("STRIPE_SECRET_KEY").pipe(Config.withDefault("")),
    STRIPE_WEBHOOK_SECRET: Config.string("STRIPE_WEBHOOK_SECRET").pipe(Config.withDefault("")),
    STRIPE_PRICE_MONTHLY: Config.string("STRIPE_PRICE_MONTHLY").pipe(Config.withDefault("")),
    STRIPE_PRICE_YEARLY: Config.string("STRIPE_PRICE_YEARLY").pipe(Config.withDefault("")),
    // Server-side revenue tracking. Empty means no analytics call is ever made.
    OPENPANEL_CLIENT_ID: Config.string("OPENPANEL_CLIENT_ID").pipe(Config.withDefault("")),
    OPENPANEL_CLIENT_SECRET: Config.string("OPENPANEL_CLIENT_SECRET").pipe(Config.withDefault("")),
    OPENPANEL_URL: Config.string("OPENPANEL_URL").pipe(Config.withDefault("")),
  },
  dev: {
    port: 3001,
  },
});

export type WebEnv = Cloudflare.InferEnv<typeof web>;

export default Alchemy.Stack(
  "openheard",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const webWorker = yield* web;

    return {
      web: webWorker.url,
    };
  }),
);
