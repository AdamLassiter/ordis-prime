# World state

World state is time-sensitive evidence about Warframe's current and upcoming
availability. Ordis Prime normalizes provider payloads into availability windows
so timers, todos and later notification rules do not depend on one API's JSON.

The initial adapter reads the PC English response from WFCD's WarframeStat.us
API. It currently recognizes landscape and hub cycles, events, alerts, Void
Fissures and Void Trader visits. Every window retains its provider record key,
payload path and immutable snapshot version.

During promotion, a provider node label is conservatively linked to a canonical
node when its name is a unique case-insensitive match. A trailing parenthetical
planet such as `Mantle (Earth)` is separated from the node name; the planet is
used only to disambiguate duplicate names with active node metadata. Unresolved
or ambiguous labels remain visible as source text without a link. Resolved
labels link timers directly to the node's rewards and player inventory overlay.

## Persistence and promotion

Dynamic snapshots have a separate lifecycle from static catalog source runs.
Each provider has one active world-state snapshot, while older snapshots remain
available for diagnostics. A refresh validates and inserts the complete new
snapshot in one transaction before making it active. Fetch, parse or promotion
failure leaves the previous snapshot active and is recorded in the shared source
operations log.

The stored `observed_at` value is the timestamp declared by the provider payload;
snapshot storage separately records when Ordis Prime retrieved the bytes. The
application stores absolute activation and expiry instants and derives countdowns
at presentation time. Provider-formatted `timeLeft` strings are never persisted.

Run an explicit refresh with:

```sh
pnpm data:refresh wfcd-worldstate
```

When run through the root workspace script, the default database and snapshot
store are under the repository `data/` directory. `ORDIS_DATA_DIR` can override
both ingestion and web storage in deployments.

World state has a separate recurring job because it needs a much shorter cadence.
The Compose deployment runs a database-leased worker service that refreshes it
every five minutes and the static WFCD item/drop sources daily. Development can run the same process
with `pnpm data:worker`; leases ensure only one worker claims a due job.
Failed calls retain the previous active snapshot and retry after one minute.
`ORDIS_CATALOG_INTERVAL_MS` and `ORDIS_CATALOG_TIMEOUT_MS` configure the static
cadence and its larger request budget. The worker retains the newest 1,000
finished scheduler jobs by default and prunes older successes and failures;
`ORDIS_JOB_HISTORY_LIMIT` changes that bound without touching queued or leased
work.

The public `/world-state` route reads the currently promoted snapshots and shows
countdowns that advance in the browser. It labels future windows separately and
shows per-source observation time and current/total window counts. A source older
than 15 minutes is visibly stale (configurable with
`ORDIS_WORLD_STATE_STALE_MS`); stale data remains available rather than silently
disappearing.

## Current limits

- Only the PC English endpoint is configured; platform and language settings are
  not yet exposed.
- The administration UI shows the newest bounded scheduler records. It does not
  yet provide per-kind history filters or worker throughput metrics. Source
  refresh attempts remain separately visible.
- Reconciliation is exact-name based and intentionally does not fuzzy-match
  aliases, relays, open worlds or provider spelling differences.
- Arbitrations between multiple live world-state providers are not implemented.
