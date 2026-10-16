# 0041: Collect only unreferenced raw snapshots

Status: accepted

## Context

Normalized catalog releases, world-state snapshots and refresh-operation rows
have bounded retention, but immutable payload directories previously accumulated
forever. Deleting payloads merely because one normalized record expired would
break replay and audit evidence still referenced by another retained record.
Filesystem cleanup also races with a refresh because publication necessarily
precedes promotion.

## Decision

Treat the union of snapshot paths referenced by source runs, world-state
snapshots and refresh attempts as the retention manifest. On each worker cycle,
after database history pruning, delete only unreferenced content-addressed
snapshot directories older than a configurable grace period. Default that grace
to one hour.

Attach a running refresh to its snapshot path immediately after the store write
and before parsing. Refresh the modification time when a content-addressed
payload is reused, giving concurrent work a new grace window. Scan only valid
source directories and SHA-256 digest directories; ignore temporary, unexpected
and symlinked entries.

Run cleanup before claiming a due refresh job. If cleanup fails, report a worker
failure without mutating a job or the currently active catalog.

## Consequences

- Raw storage converges with the configured normalized and operational history
  instead of growing for the lifetime of the deployment.
- Active releases, retained conflicts, world-state history, failed attempts and
  running attempts keep their source bytes.
- A zero grace is available for deterministic tests, while deployments default
  to protection against publication/attachment races.
- A retained database path can outlive a manually removed payload; garbage
  collection does not claim to repair pre-existing filesystem damage.
