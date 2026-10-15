# 0032: Bound normalized world-state history per source

Status: accepted

## Context

World state refreshes every five minutes and each successful refresh creates a
normalized snapshot plus its windows. Keeping every inactive normalized copy
would grow the SQLite database indefinitely even though application reads use
only the active snapshot. Source refresh rows also refer to promoted snapshots,
so deleting a snapshot without an explicit audit policy would violate those
references or erase operational history.

## Decision

After each successful world-state refresh, retain the active snapshot and the
newest configurable number of inactive snapshots independently for each source.
The default is 288 inactive snapshots, approximately one day at the default
polling cadence. The active snapshot is never counted toward or removed by the
limit, including when the limit is zero.

Before deleting an inactive normalized snapshot, clear its optional link from
source refresh rows. Keep the refresh status, timing, normalized record count
and immutable payload path. Cascading foreign keys remove the snapshot's
windows and canonical subject links atomically.

This policy does not delete raw immutable payloads or source refresh records.
Those have different audit and storage tradeoffs and require a separate policy.

## Consequences

- Normalized dynamic rows now have a predictable per-provider bound.
- Recent inactive snapshots remain available for diagnostics by default.
- Historical refresh operations remain measurable, but sufficiently old ones
  no longer have a navigable normalized snapshot relation.
- Raw payload storage and refresh-operation history can still grow without
  bound; this is an explicit remaining compromise rather than hidden cleanup.
