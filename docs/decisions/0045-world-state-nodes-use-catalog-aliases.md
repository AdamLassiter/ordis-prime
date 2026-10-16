# 0045: World-state nodes use catalog aliases

Status: accepted

## Context

Static adapters already retain source-provided aliases for canonical entities,
and dynamic subjects use those aliases as a conservative identity fallback.
World-state node reconciliation only considered canonical names, leaving a
window unlinked even when its provider label was an exact, unique node alias.
That prevented node-linked watches and acquisition opportunities from using
identity evidence the catalog already possessed.

## Decision

Resolve a world-state node label against the union of active canonical node
names and normalized node aliases. Link only when that union contains one
entity. If it contains multiple entities and the provider supplies a trailing
parenthetical planet, narrow them using active node-detail facts and link only
when one remains.

Preserve the original provider label regardless of resolution. Do not use fuzzy
matching, and do not prefer an exact canonical-name match when the same text is
also an alias for another node; that evidence is ambiguous.

## Consequences

- Exact provider aliases can power timer links, node watches and live planner
  opportunities without source-specific string rewrites.
- Shared aliases remain unresolved unless cited planet metadata disambiguates
  them.
- Retired and non-node alias owners never participate.
- Spelling differences absent from the catalog still remain visible but
  unlinked, preserving the conservative trust boundary.
