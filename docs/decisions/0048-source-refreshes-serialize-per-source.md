# 0048: Serialize refresh attempts per source

Status: accepted

## Context

Worker leases serialize scheduled jobs, but a worker, CLI invocation and web
request can still begin the same source concurrently. Their network and parsing
work occurs outside a database transaction. Allowing both attempts to run can
make the slower candidate replace a newer result, duplicate retained snapshots
and make the operations log imply an ordering that did not exist.

Different sources are intentionally composable and should not block each
other. A process can also terminate after opening an attempt, so serialization
must compose with abandoned-attempt recovery rather than creating a permanent
lock.

## Decision

Create source attempts in an immediate SQLite transaction. After registering
or refreshing source metadata, reject creation when that source already has a
`running` attempt. Do not apply this exclusion across different source IDs.

Finished attempts release the source immediately. If a process terminates, the
worker marks its attempt failed after the maximum job lease as established by
ADR 0046, after which a later attempt can begin.

## Consequences

- Scheduled, CLI and browser refresh paths share one per-source exclusion rule.
- Independent providers can still fetch and promote separately.
- A duplicate request fails before network access or snapshot creation.
- A terminated manual refresh may temporarily prevent another attempt until
  the worker's conservative recovery window elapses.
