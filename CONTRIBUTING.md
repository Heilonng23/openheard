# Contributing

## Run it locally

```bash
bun install
bun run db:push:local   # creates apps/web/local.db
bun run dev:local       # http://localhost:3001
```

Sign up once (the first account becomes admin), then `bun run db:seed` for
demo posts.

## Before you open a PR

- `bun run --filter web check-types` passes.
- Follow `DESIGN.md`. Geist, Phosphor, one button component, three radii.
- One change per PR, described in one line.
- No AI attribution in commits or PR descriptions.

## Where things live

- `apps/web/src/routes` pages, `admin/` is the dashboard
- `apps/web/src/functions` server functions
- `packages/db/src/schema` tables, `migrations/` generated with `bun run db:generate`
- `packages/ui/src/components` shadcn-style components on Base UI
