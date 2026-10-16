# 0039: Observation evidence matches its snapshot envelope

Status: accepted

## Context

Adapters emit record-level evidence inside a promoted snapshot envelope. Source
ID and snapshot version were checked, but an adapter could still emit an empty
record key or a retrieval timestamp from another fetch. Promotion stores the
run timestamp and record key as authoritative provenance, so accepting those
mismatches would make an otherwise successful release impossible to audit
accurately.

## Decision

Before staging any writes, require every observation to have a non-blank source
record key and a valid evidence retrieval time representing the same instant as
the promoted snapshot. Continue requiring its evidence source ID and snapshot
version to match the envelope as well.

Compare timestamps by parsed instant rather than text, so equivalent ISO 8601
representations remain valid. Reject the complete candidate on any mismatch.
Apply the same envelope validation to static observations and dynamic
world-state windows; provider observation time remains a separate ordering fact
for world-state freshness.

## Consequences

- A source adapter cannot accidentally combine observations from two fetches in
  one run while presenting them as one immutable snapshot.
- Every promoted fact has a usable record-level attribution key.
- Dry runs, manual uploads, scheduled refreshes and direct promotion share the
  same boundary validation.
- This verifies provenance coherence, not whether the upstream record itself is
  true or sufficiently complete.
