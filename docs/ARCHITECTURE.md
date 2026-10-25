# Architecture

Ordis Prime separates four concerns: source acquisition, canonical resolution,
player-owned state, and presentation. External records are evidence rather
than application models.

This document describes the intended end state. Current deviations are tracked
in `GAPS.md`; decisions and their reasoning live in `decisions/`.

## Data flow

1. A `SourceAdapter` fetches or reads an immutable snapshot.
2. The adapter parses the snapshot into source-neutral observations.
3. Source-specific safety policy rejects suspicious candidate shrinkage.
4. The resolver matches external IDs and curated aliases, selects values using
   explicit source priority, and records unresolved conflicts.
5. A complete candidate release is validated and promoted transactionally.
6. Read models answer catalog and acquisition questions. Player state overlays
   those models without modifying catalog facts.

Names and URL slugs are never persistence keys. Query-critical relationships
such as recipes and drops use typed tables; a generic relation is reserved for
discovery links that do not require domain-specific attributes.
Label-only cyclic reward subjects carry a source-established expected kind when
available, so legitimate same-name entities remain distinct and ambiguous
untyped subjects become reviewable conflicts rather than guessed links.

Every promoted catalog release records the exact active run for every static
source. Source-run `active` flags remain the efficient read selector, while the
immutable membership rows make retained composed releases inspectable and
reproducible. Equal-priority facts use stable source IDs rather than local row
IDs as their final composition tie-breaker. Retention is explicitly bounded; raw snapshots remain the longer-lived
audit artifact after an old normalized release is pruned, but are collected once
no retained source run, world-state snapshot or refresh attempt references them.
World-state snapshots remain a separate, faster-moving release stream.

## Runtime

The Next.js process serves public and authenticated routes. SQLite is the only
durable service. Scheduled work uses database leases so a future worker can be
split into another process without changing job semantics. Failed or stale
providers never prevent the last promoted catalog from being served.

The Compose deployment runs the web server and data worker as separate
processes over one mounted data volume. The worker polls world state frequently
and refreshes the static WFCD item/drop and selected structured WARFRAME Wiki
sources daily. MediaWiki acquisition first composes those source snapshots from
a durable per-page cache; fresh pages are normally reused for 30 days and stale
complete pages remain valid offline parser input when the provider is
unavailable. It also has a standalone CLI
entry point. Every worker claims recurring jobs through SQLite and recovers
expired leases, so multiple workers can run without intentionally duplicating
work.

## Trust boundaries

All provider payloads and imported YAML are untrusted input and must pass
runtime validation. Authentication and player authorization are checked in the
server data-access layer, not just in UI or route redirects. Catalog pages are
public; inventory, goals and progress are private to their owning account.

The optional Windows updater is outside the durable web trust boundary. An
authenticated player creates a ten-minute pairing code whose secret is stored
only as a hash. The updater obtains temporary credentials from the running game
locally, fetches the inventory itself, and sends only that inventory over HTTPS.
Pairing registers a named, revocable device credential scoped only to monotonic
inventory sync. The client stores its secret in Windows Credential Manager; the
server stores rotating current/short-grace hashes plus bounded status and audit
metadata. It never stores raw inventory or game credentials.

There is no pre-release backwards-compatibility requirement. Before the first
stable release, schemas, routes and stored data may be replaced outright when a
better model is found. Migration policy will be introduced only for released,
user-created data.
