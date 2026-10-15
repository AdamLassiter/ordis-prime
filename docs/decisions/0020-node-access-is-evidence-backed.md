# 0020: Node access is evidence-backed

Status: accepted

## Context

An acquisition recommendation is less useful when the player cannot reach its
node. Treating every node without a known prerequisite as available would turn
missing catalog data into a false product claim. Access facts already overlap
with the source-scoped discovery graph and private discovery progress.

## Decision

Compose node access into the planner read model from active cited relations.
`node requires prerequisite` and `prerequisite unlocks node` are equivalent
directed expressions of an access requirement. A supported prerequisite is
satisfied when the player has marked its discovery topic completed.

Classify a node as available when all documented requirements are complete,
blocked when at least one is incomplete, and unknown when no supported access
relation is active. Keep every candidate visible, show its evidence sources,
and order available nodes before unknown and blocked nodes while preserving the
existing coverage order within each class.

## Consequences

- Source refreshes atomically change the access assessment with the relation.
- Missing evidence is visible and never interpreted as proof of access.
- Player progress remains portable; computed access is not duplicated in a
  profile.
- Mastery rank, junction conditions, branching alternatives and other
  conditional gates require future typed facts rather than prose parsing.
