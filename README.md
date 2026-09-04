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

## Run it

```bash
bun install
bun run db:generate
bun run dev
```

Open http://localhost:3001.

## Deploy

```bash
cd packages/infra && bunx alchemy login --configure
bun run deploy
```

That provisions the Worker and the D1 database and applies migrations.

## License

MIT
