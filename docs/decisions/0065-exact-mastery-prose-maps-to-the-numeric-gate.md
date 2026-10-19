# 0065: Exact Mastery prose maps to the numeric gate

Status: accepted; Railjack Intrinsics added separately by decision 0069

## Context

The Wiki mission module represents access conditions as prose, including exact
forms such as “Must be Mastery Rank 8 or higher to access.” The catalog and
planner already have a typed, cited numeric Mastery Rank field and a separate
private combined Mastery/Legendary Rank input.

The same source also contains Intrinsics ranks and compound requirements.
Treating those as Mastery Rank, or extracting a Mastery number from a larger
expression, would change the meaning of the source.

## Decision

Recognize only the anchored, Mastery Rank-only requirement form and map its
integer to the existing node-detail `masteryRequirement` field. Reject an exact
form outside the game's zero-through-thirty Mastery range. Do not parse
Intrinsics ranks or mixed expressions into this field.

Node pages compare a sourced gate with the signed-in player's private combined
Mastery/Legendary Rank. Absence of that private value remains “not recorded,”
not a rank of zero.

## Consequences

- The adoption-time import adds Wiki-backed gates for Kronia Relay at rank 4,
  Oro at rank 5 and Orcus Relay at rank 8. WFCD independently agrees on Oro.
- The planner and node page consume one provider-neutral numeric fact; neither
  parses source prose.
- Railjack Intrinsics remain separate from ordinary Mastery gates and are
  modeled under decision 0069. Other unsupported compound conditions remain
  explicit gaps.
