# Ordis Prime

Ordis Prime is a self-hosted Warframe companion built around one source-aware
catalog. Its first useful path joins item ownership, recipes, drop tables and
star-chart nodes so that every acquisition answer can explain where it came
from.

## Current milestone

- typed canonical entity, acquisition and provenance contracts
- composable source-adapter and conflict-resolution pipeline
- SQLite/Drizzle persistence for catalog, sources, accounts and player progress
- local account bootstrap and database-backed sessions
- public linked item/node explorer with authenticated inventory overlays
- persisted acquisition goals and explainable node recommendations
- live world-state timers with database-leased automatic polling
- private todos, dynamic watches, and deduplicated in-app alerts
- editable loadouts, immutable share links, and cited tier-list comparison
- composed node metadata and an inventory-aware star-chart index
- portable profile export and merge/replace import
- two-service Docker Compose deployment over one durable data volume
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
pnpm data:refresh manual:data/manual/editorial.example.yaml
pnpm dev
```

Copy `.env.example` to `.env`. Production uses `docker compose up --build` and
stores all durable state in the `ordis-prime-data` volume. On a new database,
open `/setup` and use `ORDIS_SETUP_TOKEN` to create the only bootstrap
administrator. Registration remains closed unless explicitly enabled.

`data:refresh` runs the same provider-neutral pipeline for each named adapter:
fetch, immutable snapshot storage, parsing, validation, and transactional
promotion. Omit names to refresh every registered adapter.

`data:worker` runs the recurring world-state worker for development. Docker
Compose runs that worker alongside the web service over the same durable volume.

## Data safety

The intended refresh model stages and promotes source data in one transaction,
so a failed refresh cannot replace the active source run. User inventory is
stored separately against stable canonical IDs, and portable exports prefer
provider identifiers so a profile can resolve against a different installation.
Catalog-wide candidate releases and pruning of superseded relation rows remain
documented gaps.
