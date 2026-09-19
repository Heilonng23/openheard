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
    BETTER_AUTH_SECRET: Config.redacted("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: Config.string("BETTER_AUTH_URL").pipe(Config.withDefault("")),
    ROOT_DOMAIN: Config.string("ROOT_DOMAIN").pipe(Config.withDefault("")),
    GOOGLE_CLIENT_ID: Config.string("GOOGLE_CLIENT_ID").pipe(Config.withDefault("")),
    GOOGLE_CLIENT_SECRET: Config.string("GOOGLE_CLIENT_SECRET").pipe(Config.withDefault("")),
    STRIPE_SECRET_KEY: Config.string("STRIPE_SECRET_KEY").pipe(Config.withDefault("")),
    STRIPE_WEBHOOK_SECRET: Config.string("STRIPE_WEBHOOK_SECRET").pipe(Config.withDefault("")),
    STRIPE_PRICE_MONTHLY: Config.string("STRIPE_PRICE_MONTHLY").pipe(Config.withDefault("")),
    STRIPE_PRICE_YEARLY: Config.string("STRIPE_PRICE_YEARLY").pipe(Config.withDefault("")),
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
