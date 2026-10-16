# 0042: Use source-specific shrinkage guards

Status: accepted

## Context

Rejecting an empty parse does not protect the catalog from a valid JSON response
that contains only a small fraction of a provider's normal records. Such a
candidate can retire no identities under the explicit-tombstone policy, but it
does withdraw source-scoped drops, recipes, node details and provenance when it
becomes active.

A universal minimum is inappropriate. Automatic aggregate feeds are expected to
remain broadly complete, while a manual ranking, discovery guide or correction
file may intentionally replace a large set with a small one.

## Decision

Let each source adapter declare an optional minimum retained observation ratio.
Store the normalized input observation count on every new source run. Before
staging a different version, compare its candidate count with the previous
active run and reject it when it falls below the declared ratio.

Set both automatic WFCD catalog adapters to `0.5`. Leave manual adapters without
a shrinkage policy. Skip comparison for the first run and for older runs that
predate stored observation counts. Validate policy values as finite numbers from
zero through one, inclusive.

Apply the check inside the same transaction as promotion but before any source,
run or entity write. Re-importing an already-active identical version remains an
idempotent no-op.

## Consequences

- A severely truncated WFCD response cannot replace the last healthy catalog.
- The rejected snapshot and failure remain inspectable through the refresh
  operation without changing active source membership. Its refresh record also
  retains the rejected observation count for direct comparison with the active
  baseline.
- The baseline survives pruning of refresh-operation rows because it belongs to
  the source run.
- The guard detects gross count loss, not selective missing records, distorted
  values or suspicious changes above the threshold; those need richer policy.
- Changing parser output substantially may require an intentional adapter-policy
  change alongside its parser-version bump.
