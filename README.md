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

Working: board with votes, search, filters and sorting; posts with comments
and a status timeline; admin status changes, merges, pins, tags, ETAs;
roadmap; changelog that ships linked posts; settings for workspace, boards
and tags.

Next: email on status change, magic link sign-in, embed widget, GitHub
issues sync, import from Canny.

## License

MIT
