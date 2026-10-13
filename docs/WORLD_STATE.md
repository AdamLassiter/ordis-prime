# World state

World state is time-sensitive evidence about Warframe's current and upcoming
availability. Ordis Prime normalizes provider payloads into availability windows
so timers, todos and later notification rules do not depend on one API's JSON.

The initial adapter reads the PC English response from WFCD's WarframeStat.us
API. It currently recognizes landscape and hub cycles, events, alerts, Void
Fissures and Void Trader visits. Every window retains its provider record key,
payload path and immutable snapshot version.

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

World state is excluded from the default static catalog refresh because it needs
a much shorter cadence. A database-leased scheduler will eventually invoke it.

## Current limits

- Only the PC English endpoint is configured; platform and language settings are
  not yet exposed.
- Snapshot ingestion exists, but automatic polling, stale-data policy, player
  todo rules and notifications do not.
- Windows use provider node labels until dynamic nodes can be reconciled safely
  with canonical catalog node identities.
- Arbitrations between multiple live world-state providers are not implemented.
