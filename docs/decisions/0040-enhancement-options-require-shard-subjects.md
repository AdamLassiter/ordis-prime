# 0040: Enhancement options require shard subjects

Status: accepted

## Context

Enhancement options model the selectable effect of an installed Archon Shard.
Build mutations already require a canonical shard, but promotion previously
accepted an option attached to any resolved entity. A cross-source identifier
mistake could therefore publish an apparently cited effect list on a weapon,
mod or other unrelated catalog entry.

## Decision

As part of composed-catalog validation, require every active enhancement option
to resolve to a non-retired canonical entity of kind `shard`. Perform the check
after the incoming source replaces its prior active run and inside the same
transaction as release publication.

Treat a wrong-kind subject as an invalid composition rather than a resolver
conflict: its identity is unambiguous, but it cannot satisfy this fact's
semantic contract.

## Consequences

- Manual and future automated sources cannot attach selectable shard effects to
  unrelated entities.
- Cross-source kind refinements are evaluated against the complete candidate
  release rather than the incoming file in isolation.
- A violation rolls back the new run, its facts and the active-source switch.
- This rule is deliberately specific to Archon Shard effect choices; arcane
  compatibility remains represented by sourced arcane and weapon classes.
