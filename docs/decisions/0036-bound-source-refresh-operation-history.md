# 0036: Bound source refresh operation history per source

Status: accepted

## Context

Every static and world-state attempt records timing, status, counts, errors and
snapshot links. Those rows drive administration history and throughput metrics,
but recurring polling would otherwise grow the operation table indefinitely.
Queued and leased jobs have a separate lifecycle and cannot substitute for this
source-level audit.

## Decision

Retain the newest configurable number of finished refresh operations separately
for each source. The default is 1,000. Running attempts are never counted toward
the limit or deleted, including when the configured limit is zero. Pruning runs
inside a transaction during normal worker cycles.

Administration history and aggregate throughput cover the retained window, not
the installation's lifetime. Removing an operation row does not remove source
runs, normalized world-state snapshots, catalog releases or immutable payload
directories; each has an independent retention boundary.

## Consequences

- Static and fast-polling sources receive equal per-source audit capacity.
- Active attempts remain inspectable and cannot be broken by cleanup.
- Historical metrics are explicitly windowed and may change when old operations
  age out.
- Raw snapshot storage can still grow without bound and needs a filesystem-safe
  garbage-collection policy that accounts for concurrent workers.
