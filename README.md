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
- automated, source-attributed WARFRAME Wiki weapon-rank enrichment
- generated initial SQLite migration

The application treats WFCD datasets and selected structured WARFRAME Wiki
modules as attributed inputs. Wiki enrichment is deliberately adapter-specific
rather than a generic page scraper.

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
pnpm data:refresh wfcd-items wfcd-drops warframe-wiki-weapons
pnpm data:refresh manual-ranking:data/manual/editorial.example.yaml
pnpm data:refresh manual-discovery:data/manual/discovery.example.yaml
pnpm data:refresh manual-facts:data/manual/facts.example.yaml
pnpm dev
```

Copy `.env.example` to `.env`. Production uses `docker compose up --build` and
stores all durable state in the `ordis-prime-data` volume. On a new database,
open `/setup` and use `ORDIS_SETUP_TOKEN` to create the only bootstrap
administrator. Registration remains closed unless explicitly enabled.

`data:refresh` runs the same provider-neutral pipeline for each named adapter:
fetch, immutable snapshot storage, parsing, validation, and transactional
promotion. Omit names to refresh every registered adapter.

`data:worker` runs recurring world-state and static catalog refreshes for
development. Docker Compose runs that worker alongside the web service over the
same durable volume.

## Data safety

The intended refresh model stages and promotes source data in one transaction,
so a failed refresh cannot replace the active source run. User inventory is
stored separately against stable canonical IDs, and portable exports prefer
provider identifiers so a profile can resolve against a different installation.
Each promotion records complete active source membership, and the worker bounds
inactive normalized release history. Candidate-wide and composed-catalog
validation protect known invariants, while selective source omissions and
richer domain-specific completeness checks remain documented gaps. Raw
snapshots are collected only after no retained database record references them
and a configurable safety grace has elapsed.
