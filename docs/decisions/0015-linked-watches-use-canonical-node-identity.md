# ADR 0015: Use canonical identity for linked node watches

## Decision

A world-state watch may link to one canonical entity. When that entity is a
star-chart node, evaluation requires the normalized window's reconciled node to
have the same canonical slug. The ordinary label, state and node-text filters
still apply.

Links to other entity kinds provide navigation and context but are not an
implicit matching predicate. Their explicit normalized text filters continue to
define matching until world-state subjects or rewards have canonical identity.

## Rationale

Text such as a node name is useful for loose provider data but can collide with
similar labels. World-state promotion already resolves unambiguous nodes, so a
node-linked watch should use that stronger identity. Pretending every item link
has the same semantics would hide a join the source data cannot currently make.

## Consequences

- A reconciled node watch is exact and source-neutral.
- An unreconciled window does not trigger an exact node watch; it remains visible
  in the timer view for investigation.
- Detail-page shortcuts choose an editable initial kind: fissure for nodes and
  event for other entities.
- Profile version 8 carries optional watch entity references. Unresolved links
  are reported while the watch rule itself is retained.
