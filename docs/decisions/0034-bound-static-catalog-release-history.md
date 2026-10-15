# 0034: Bound static catalog release history

Status: accepted

## Context

Every static-source promotion creates a composed release and retains all
normalized facts from the superseded run. Daily automated refreshes would make
those inactive recipes, drops, relations, rankings and provenance rows grow
without bound. Release membership is also the only reliable record of which
source versions formed a prior composed catalog.

Resolver conflicts have a different lifecycle. They may have review events or
active identity overrides and must not disappear merely because their source
run is old.

## Decision

Retain the active release and a configurable number of newest inactive catalog
releases. The default inactive history is 20. Once an older release is removed,
delete each inactive source run that no retained release references, together
with its normalized facts. Clear the optional link from retained source-refresh
operations before deleting the run.

Any source run containing a resolver conflict is exempt from pruning. This
protects unresolved work, conflict reviews and identity-override audit records.
Canonical entities, external identifiers, aliases and all player state are not
owned by one source run and are never deleted by this policy.

Raw immutable payloads and source-refresh records have independent retention.
They remain available after normalized release history expires.

## Consequences

- The largest inactive static fact tables now have a predictable retained
  history rather than growing on every daily refresh.
- The current release and its source runs are never pruning candidates.
- Retained releases remain exactly inspectable; releases outside the configured
  history no longer exist as normalized replay points.
- Conflict-bearing runs can exceed the nominal bound until an explicit conflict
  lifecycle policy is adopted.
- Raw payload storage and refresh-operation history remain unbounded gaps.
