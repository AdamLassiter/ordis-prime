# ADR 0014: Model build enhancements separately from equipment

## Decision

Arcanes and Archon Shards are build-level enhancements with a fixed slot
vocabulary. They are not equipment entries or positioned mods. Each slot holds
one canonical entity and an optional rank; arcane slots require `arcane`
entities and shard slots require `shard` entities.

Enhancements are included in draft revisions, immutable share snapshots, clones,
acquisition goals and portable profiles.

## Rationale

Equipment owns configurations, Forma, capacity upgrades and mod grids. Reusing
that structure would create fictional equipment semantics for enhancements and
make repeated shard requirements difficult to count. A separate relation keeps
the concepts composable while still joining everything through canonical entity
identity.

## Consequences

- The initial slot vocabulary is intentionally explicit and can change before
  release without a compatibility layer.
- Arcane subtype compatibility is not yet enforced. WFCD exposes subtypes in its
  item payload, but the canonical entity model currently retains only the broad
  arcane kind.
- A shard records identity and position but not the selected stat effect; that
  needs a sourced effect model rather than free-form strings.
