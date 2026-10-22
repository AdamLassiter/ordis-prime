# 0090: WFCD identity drift repairs exact provider identifiers

Status: accepted

## Context

Early WFCD imports classified nested recipe entries before considering their
top-level declarations. A resource seen in only one recipe could therefore
become a parent-qualified component, such as “Zylok Prime Orokin Cell,” even
though its stable WFCD identifier belonged to the ordinary Orokin Cell
resource. Later parser versions emitted the correct declaration but promotion
treated the changed kind as a conflict, leaving thousands of repeated
observations unresolved.

Legacy alias matching could also attach multiple WFCD identifiers to one entity
before their incompatible kinds were known, as happened to the Kuva resource
and an enemy named Kuva.

## Decision

Treat a changed kind for the same exact `wfcd-items` identifier as a bounded
provider-parser repair rather than ordinary cross-source ambiguity. The same
exact-ID path may refine an `unknown` placeholder from any source when one
unambiguous canonical entity already has the newly known kind and name. Never
use this path when a provider currently reports an unknown kind.

When the legacy entity owns only that WFCD identifier, reclassify it in place.
If one existing canonical entity has the corrected name and kind, move the WFCD
identifier to that entity, retire the now-unidentified legacy entity, and merge
private inventory, acquisition-goal, todo, and watch references. Counts merge
monotonically.

When one legacy entity owns other provider identifiers and a refreshed
observation proves that one WFCD identifier has an incompatible kind, detach
only that identifier and resolve it again. This covers both multiple WFCD IDs
and old cross-source same-name matches without disturbing the remaining
identity.

Keep ordinary conflicts unchanged for manual-source disagreements, ambiguous
corrected targets, and compatible same-kind records.

## Consequences

Refreshing WFCD repairs previous parser mistakes without deleting the database
or discarding player tracking. Historical source-run facts and recipes can
still reference the retired legacy identity, while the active composed release
uses the corrected entity.

The repair relies on exact provider identifiers and cannot infer whether two
same-kind WFCD identifiers with identical display text are conceptually the
same item. Those remain governed by the adapter's explicit collision rules.
