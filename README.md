# openheard

Open source feedback board that looks like a 2026 product. Board, roadmap,
changelog. One Cloudflare Worker, D1, deploys free in one click.

Status: early. Built in the open for The Build Games, September 2026.

## Why

Every open source feedback tool needs a VPS, Docker and Postgres, and most of
them look like an admin template. openheard runs on the Cloudflare free tier
with nothing to babysit, and it is designed like something people would pay
for. Self-host is the default, not the afterthought.

## Stack

- TanStack Start, React 19, TypeScript
- Cloudflare Workers + D1, provisioned with Alchemy
- Drizzle ORM, Better Auth
- Tailwind 4, shadcn primitives with our own tokens, Phosphor icons, Geist

Design rules live in [DESIGN.md](./DESIGN.md). Read it before touching UI.

## Run it locally

No Cloudflare account needed. A SQLite file stands in for D1.

```bash
bun install
bun run db:push:local   # creates apps/web/local.db from the schema
bun run dev:local       # http://localhost:3001
```

Sign up once, that account becomes the admin. Then, if you want sample
data to click around in:

```bash
bun run db:seed
```

Keyboard on the board: `j` `k` move, `v` vote, `enter` open, `/` search,
`c` new post.

## Deploy to Cloudflare

```bash
cd packages/infra && bunx alchemy login --configure
cd ../.. && bun run deploy
```

That provisions the Worker and the D1 database, applies migrations and
prints the URL. Runs on the free tier.

## Status

Working: public board with votes, search and sorting; posts with comments and
a status timeline; roadmap; changelog with RSS; an admin dashboard at `/dashboard`
with an inbox, internal notes, merges, pins, tags, and settings for the
workspace, boards, tags and team.

Next: image uploads, magic link sign-in, email invites, an HTTP API with keys,
then an MCP server, a CLI and an embeddable widget on top of it.

## License

The app (`apps/web`, `packages/db`, `packages/auth`, `packages/ui`) is
[AGPL-3.0](./LICENSE). Self-host it freely; if you run a modified version as
a service, publish your changes.

The pieces you embed in your own product, the widget, the CLI, the MCP server
and the API client, will ship under MIT in their own packages so they never
touch your licence.
