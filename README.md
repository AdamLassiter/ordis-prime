# Ordis Prime

Ordis Prime is a self-hosted Warframe companion built around one source-aware
catalog. Its first useful path joins item ownership, recipes, drop tables and
star-chart nodes so that every acquisition answer can explain where it came
from.

## Current milestone

- typed canonical entity, acquisition and provenance contracts
- composable source-adapter and conflict-resolution pipeline
- SQLite/Drizzle schema for catalog, sources, accounts and player progress
- public linked item/node explorer and authenticated planner shell
- single-container Docker Compose deployment
- deterministic domain and adapter tests
- generated initial SQLite migration

The application treats WFCD datasets as structured inputs and links to the
Warframe Wiki for detail. It does not scrape the wiki in v1.

Design intent, decisions, roadmap, and honest implementation gaps are indexed in
[`docs/README.md`](docs/README.md).

## Development

Requires Node 22.16+ and pnpm 10. After dependencies are available:

```sh
corepack enable
pnpm install
pnpm test
pnpm check
pnpm build
pnpm db:migrate
pnpm data:refresh wfcd-items wfcd-drops
pnpm dev
```

Copy `.env.example` to `.env`. Production uses `docker compose up --build` and
stores all durable state in the `ordis-prime-data` volume.

`data:refresh` runs the same provider-neutral pipeline for each named adapter:
fetch, immutable snapshot storage, parsing, validation, and transactional
promotion. Omit names to refresh every registered adapter.

## Data safety

The intended refresh model stages and promotes source data in one transaction,
so a failed refresh cannot replace the active release. This promotion path is
not implemented yet. User inventory is modeled against stable canonical IDs so
an upstream rename or retirement will not erase progress once persistence is
wired into the application.
