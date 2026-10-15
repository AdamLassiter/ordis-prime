# 0021: Enhancement options are source facts

Status: accepted

## Context

An Archon Shard identity is not a complete build choice: each installed shard
also selects one effect. A free-form build note cannot validate that choice or
survive source comparison, while hard-coded UI strings would bypass the
application's provenance model.

## Decision

Represent selectable enhancement effects as immutable, source-run-scoped facts
attached to a canonical entity. Each option has a stable lowercase-hyphen key,
a concise label, record-level evidence and a citation. Active sources are
composed by key using the same priority and recency policy as other catalog
facts.

When a player assigns a shard, require an option active for that exact entity.
Persist both its key and its current label on the private build. The key is the
portable identity; the copied label preserves what an immutable share or an old
draft said if a later catalog release withdraws the option. Such a draft is
shown as unavailable and is never silently rewritten.

## Consequences

- Manual sources and future automated adapters can publish options through the
  same observation and promotion pipeline.
- Catalog pages and build selection expose source attribution.
- Profile import rejects a build whose selected option is absent rather than
  guessing a replacement.
- Arcane compatibility remains separate: it needs canonical arcane and weapon
  subtype facts, not another use of enhancement-option keys.
