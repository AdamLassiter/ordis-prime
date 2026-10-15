# 0037: Composed releases enforce reference liveness

Status: accepted

## Context

Candidate-wide validation catches contradictions inside one incoming source,
but canonical identities are shared across sources. One source could tombstone
an entity while another active source still used it as a drop reward, recipe
member, node, relation endpoint, enhancement subject or ranking member. Read
models deliberately hide retired entities, so accepting that composition would
silently discard otherwise valid active facts.

## Decision

Inside the promotion transaction, replace the incoming source's active run and
then validate the resulting composed active catalog before publishing a release.
Require exactly one active run per represented source and require every entity
referenced by an active structured fact to be non-retired. A violation aborts
and rolls back the source run, entity retirement, active-run switch and release.

The checked fact families are recipes and ingredients, drop rewards and nodes,
node details, both typed-relation endpoints, enhancement options and editorial
ranking members. Provenance is evidence about fields rather than a catalog fact
consumer and does not keep an entity alive by itself.

## Consequences

- A provider cannot invalidate another active provider's facts through a shared
  tombstone.
- Failed composition leaves the previously active release and entity state
  untouched.
- This establishes a release-wide validation hook for future semantic checks.
- Referential liveness does not prove dataset completeness, expected coverage,
  correct recipe alternatives or agreement between independent sources; those
  remain separate policies.
