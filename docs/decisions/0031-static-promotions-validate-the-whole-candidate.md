# 0031: Static promotions validate the whole candidate

Status: accepted

## Context

Per-observation checks catch invalid numbers and evidence, while SQLite protects
referential integrity. Neither can explain contradictions that only emerge when
the complete parsed snapshot is compared with itself. Previously those defects
could become resolver conflicts, low-level uniqueness failures, or—when repeated
observations shared an external identifier—silent last-write-wins field changes.

A live WFCD validation exposed the concrete failure: shared recipe materials
were emitted once per parent with names such as “Ack & Brunt Forma” and “Acrid
Forma,” despite every observation carrying the same Forma identifier.

## Decision

Validate candidate-wide invariants before opening the promotion transaction or
creating a source run. Reject contradictory declarations for one external ID,
conflicting names for one kind/slug, duplicate node details and enhancement
options, duplicate ranking sets/members, undeclared ranking sets, and tiers
outside their candidate set's scale. Error messages name the implicated source
records.

Keep catalog-resolution ambiguity separate. A candidate that is internally
coherent may still produce a reviewable conflict when composed with other active
sources.

The WFCD item parser now performs a payload-wide identity pass before emitting
observations. Shared materials retain intrinsic names, one-off generic parts are
parent-qualified, and genuinely distinct same-kind display collisions receive
stable provider-type qualifiers. Semantically duplicate store/internal records
with the same display name and type still converge intentionally.

## Consequences

- Dry runs, manual imports, CLI refreshes and worker refreshes share the same
  pre-staging gate.
- Malformed snapshots leave no staged run and cannot replace active data.
- Candidate validation does not assert cross-source completeness. Suspicious
  count shrinkage is handled separately by the per-source policy in ADR 0042.
- Parser version `wfcd-items-v6` ensures unchanged upstream bytes replay under
  the corrected shared-material semantics.
