# 0038: Recompute canonical fields from active assertions

Status: accepted

## Context

Entity-field provenance recorded which source run supplied a field, but not the
value that it supplied. Promotion could protect a high-priority correction from
a lower-priority refresh, yet it could not reconstruct the next winner when the
correction's next source run stopped asserting that field. The canonical value
then outlived its active evidence.

This is especially harmful for composable sources: a manual overlay should be
able to add and later withdraw one correction without copying the provider's
remaining entity record.

## Decision

Store the JSON-encoded asserted value on every entity-field provenance row.
After switching the incoming source's active run inside the promotion
transaction, recompute each canonical field from active assertions ordered by:

1. source priority, descending;
2. source-run retrieval time, descending;
3. source-run ID, descending as a deterministic tie-breaker.

Clear optional description, arcane-class and weapon-class columns when they had
a value-bearing assertion but no active assertion remains. Keep name and slug
when no active source asserts them because they are non-null identity labels
used to resolve and route the canonical entity. Run composed-catalog validation
only after recomputation, so any constraint failure rolls the source switch and
field changes back together.

## Consequences

- Withdrawing a manual correction reveals the best remaining active provider
  value.
- Withdrawing the final optional assertion clears the canonical field instead
  of retaining stale data.
- Every newly written field provenance record is sufficient to reconstruct its
  canonical winner. Existing provenance has no recoverable asserted value, so
  its column is nullable and its canonical value is preserved until refresh.
- Values use JSON rather than field-specific provenance columns, leaving room
  for future typed fields while promotion still validates the currently
  supported canonical fields as strings.
- Name and slug have an explicit retention compromise until canonical identity
  is separated from source-owned presentation fields.
