# 0101: MediaWiki pages are durable parser inputs

## Context

Several catalog adapters read overlapping WARFRAME Wiki modules. Fetching those
pages afresh for every daily source job couples parser work to network
availability, repeats requests, and makes a parser-only change unnecessarily
contact the Wiki. Source snapshots preserve the bytes used by one promoted run,
but they are source-shaped bundles rather than a reusable page store.

The structured Lua modules also contain substantially more public data than the
first adapters normalized. Weapon records, for example, include every attack's
damage distribution, critical and status statistics, falloff, range and firing
behavior.

## Decision

Every MediaWiki fetch performed through the shared helper stores each complete
API page response independently under `data/cache/mediawiki-pages`. A cache
record includes the API origin, requested title, the complete current-page
metadata and revision payload, and `fetchedAt`. Cache keys hash the origin and
title, and writes are atomic.

Queued source refreshes use a 30-day page freshness window by default. They
compose the required pages from the durable cache and then run the adapter
parser against that offline snapshot. Missing or expired pages are refreshed in
one API request for the required set. If the Wiki is unavailable and every page
is already cached, parsing continues from the stale complete cache; a missing
page still fails closed. The snapshot retrieval time is the oldest contributing
page fetch time so provenance never presents reused bytes as newly retrieved.

The immutable source snapshot remains the exact parser input and stays subject
to normal promotion, audit and retention rules. The page cache is auxiliary,
mutable acquisition state: it avoids network work but is not provenance by
itself. A MediaWiki snapshot-envelope version is included beside the adapter
parser version, so changing how cached pages are composed cannot reuse an older
version identifier with different bytes.

Adapters parse literal Lua data without executing module code. Public scalar,
list and nested statistic fields should be retained as sourced entity
attributes when their meaning is stable. Parser versions change whenever that
normalization changes, allowing cached upstream revisions to be reprocessed.

## Consequences and gaps

- Overlapping adapters share a page fetch, and parser releases can replay while
  the Wiki is offline.
- `fetchedAt` is inspectable in every per-page JSON record and flows into the
  composed source snapshot's provenance timestamp.
- A manually queued adapter refresh usually reprocesses cached data; it does not
  imply a forced upstream fetch.
- The cache stores complete responses only for pages explicitly required by an
  adapter. It is not an unrestricted crawl of the Wiki.
- Lua expressions that are not literal data are deliberately skipped rather
  than evaluated. Complex tables need source-specific normalization before
  they become application facts.
- Cache eviction and an operator-facing cache inventory are not yet provided.
