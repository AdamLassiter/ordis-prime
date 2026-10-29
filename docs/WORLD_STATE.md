# World state

World state is time-sensitive evidence about Warframe's current and upcoming
availability. Ordis Prime normalizes provider payloads into availability windows
so timers, todos and later notification rules do not depend on one API's JSON.

The initial adapter reads the PC English response from WFCD's WarframeStat.us
API. It currently recognizes landscape and hub cycles, events, alerts, Void
Fissures and Void Trader visits. Every window retains its provider record key,
payload path and immutable snapshot version. Promotion requires that record key
to be non-blank and its evidence source, version and retrieval instant to match
the archived snapshot envelope.

During promotion, a provider node label is conservatively linked to a canonical
node when its case-insensitive name or normalized catalog alias identifies one
active node. A trailing parenthetical planet such as `Mantle (Earth)` is
separated from the candidate name or alias; the planet is used only to
disambiguate multiple matches with active node metadata. Unresolved or
ambiguous labels remain visible as source text without a link. Resolved labels
link timers directly to the node's rewards and player inventory overlay.

Windows can also carry source-neutral subjects. The WFCD adapter emits alert
rewards, event names and rewards, and Void Trader inventory entries. WFCD item
`uniqueName` identifiers resolve first; an exact, unique canonical name or alias
is the conservative fallback. Every raw subject label remains on the snapshot
even when it cannot be reconciled. Resolved subjects link from timer cards and
let item-linked watches match canonical identity rather than substrings.

Weekly Circuit rewards are static cyclic source facts rather than polled live
state. The selected `The Circuit` Wiki revision supplies two independently
anchored schedules: 11 Normal phases with three Warframe paths and nine Steel
Path phases with five Incarnon Genesis choices. Each row retains the phase index
used by the Wiki expression; displayed week order is not assumed to equal the
epoch's zero phase when Digital Extremes inserts a new rotation. The read model
derives current and next absolute windows from the stored epoch and interval.
Those derived windows use the `rotation` kind, participate in the same private
watch/notification engine, and expose resolved reward subjects without copying
them into dynamic snapshot tables.

## Persistence and promotion

Dynamic snapshots have a separate lifecycle from static catalog source runs.
Each provider has one active world-state snapshot. The worker retains the newest
288 inactive normalized snapshots per provider by default, then removes older
window rows while preserving refresh timing, status, record count and snapshot
path as audit metadata. A refresh validates and inserts the complete new snapshot
in one transaction before making it active. Fetch, parse or promotion failure
leaves the previous snapshot active and is recorded in the shared source
operations log.
Promotion also requires a candidate's provider observation time to be at least
as recent as the active snapshot. An older or previously inactive snapshot
cannot rewind the timer view; it becomes a failed refresh while the last known
good snapshot remains active. Repeating the already-active version and hash is
an idempotent success.

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
Bundled manual rankings are immutable application input rather than mutable
storage, so the worker resolves them from the root pnpm invocation directory.
`ORDIS_MANUAL_DATA_DIR` overrides that location for packaged deployments;
changing `ORDIS_DATA_DIR` does not move or hide bundled ranking files.

World state has a separate recurring job because it needs a much shorter cadence.
The Compose deployment runs a database-leased worker service that refreshes it
every five minutes and the static WFCD item/drop sources daily. Development can run the same process
with `pnpm data:worker`; leases ensure only one worker claims a due job.
Failed calls retain the previous active snapshot and retry after one minute.
`ORDIS_CATALOG_INTERVAL_MS` and `ORDIS_CATALOG_TIMEOUT_MS` configure the static
cadence and its larger request budget. The worker retains the newest 1,000
finished scheduler jobs by default and prunes older successes and failures;
`ORDIS_JOB_HISTORY_LIMIT` changes that bound without touching queued or leased
work. `ORDIS_WORLD_STATE_HISTORY_LIMIT` changes the per-provider inactive
normalized-snapshot bound; zero retains only the active snapshot. Raw immutable
source payloads and source refresh records are not deleted by this policy.
`ORDIS_NOTIFICATION_RETENTION_MS` controls how long read player alerts remain
after their matching window expires; unread and non-expiring alerts are exempt.

The public `/world-state` route reads the currently promoted snapshots and shows
countdowns that advance in the browser. It labels future windows separately and
shows per-source observation time and current/total window counts. A source older
than 15 minutes is visibly stale (configurable with
`ORDIS_WORLD_STATE_STALE_MS`); stale data remains available rather than silently
disappearing.
It also shows current, next, and expandable complete Circuit schedules. Their
freshness follows the daily static Wiki adapter rather than the 15-minute live
world-state warning.

## Current limits

- Only the PC English endpoint is configured; platform and language settings are
  not yet exposed.
- The administration UI shows the newest bounded scheduler records with kind,
  status and source filters. Source refresh attempts and normalized throughput
  remain separately visible.
- Reconciliation uses provider identifiers where supplied, then exact unique
  names or normalized catalog aliases. It intentionally does not fuzzy-match relays, open worlds,
  reward labels or provider spelling differences. Event reward extraction does
  not yet cover every possible provider-specific nested reward shape.
- Arbitrations between multiple live world-state providers are not implemented.
