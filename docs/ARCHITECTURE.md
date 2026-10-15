# Architecture

Ordis Prime separates four concerns: source acquisition, canonical resolution,
player-owned state, and presentation. External records are evidence rather
than application models.

This document describes the intended end state. Current deviations are tracked
in `GAPS.md`; decisions and their reasoning live in `decisions/`.

## Data flow

1. A `SourceAdapter` fetches or reads an immutable snapshot.
2. The adapter parses the snapshot into source-neutral observations.
3. The resolver matches external IDs and curated aliases, selects values using
   explicit source priority, and records unresolved conflicts.
4. A complete candidate release is validated and promoted transactionally.
5. Read models answer catalog and acquisition questions. Player state overlays
   those models without modifying catalog facts.

Names and URL slugs are never persistence keys. Query-critical relationships
such as recipes and drops use typed tables; a generic relation is reserved for
discovery links that do not require domain-specific attributes.

Every promoted catalog release records the exact active run for every static
source. Source-run `active` flags remain the efficient read selector, while the
immutable membership rows make retained composed releases inspectable and
reproducible. Retention is explicitly bounded; raw snapshots remain the longer-lived
audit artifact after an old normalized release is pruned.
World-state snapshots remain a separate, faster-moving release stream.

## Runtime

The Next.js process serves public and authenticated routes. SQLite is the only
durable service. Scheduled work uses database leases so a future worker can be
split into another process without changing job semantics. Failed or stale
providers never prevent the last promoted catalog from being served.

The Compose deployment runs the web server and data worker as separate
processes over one mounted data volume. The worker polls world state frequently
and refreshes the static WFCD item/drop sources daily. It also has a standalone CLI
entry point. Every worker claims recurring jobs through SQLite and recovers
expired leases, so multiple workers can run without intentionally duplicating
work.

## Trust boundaries

All provider payloads and imported YAML are untrusted input and must pass
runtime validation. Authentication and player authorization are checked in the
server data-access layer, not just in UI or route redirects. Catalog pages are
public; inventory, goals and progress are private to their owning account.

There is no pre-release backwards-compatibility requirement. Before the first
stable release, schemas, routes and stored data may be replaced outright when a
better model is found. Migration policy will be introduced only for released,
user-created data.
