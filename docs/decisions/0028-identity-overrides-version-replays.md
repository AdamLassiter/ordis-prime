# ADR 0028: Version replays with identity overrides

## Decision

Ambiguous entity conflicts retain the observation's exact external identifiers
and the resolver's candidate entity IDs. An administrator may bind one retained
external ID to one offered active candidate with a required note. The current
mapping is stored separately from canonical external IDs, and bound/revoked
events form an append-only actor and timestamp audit.

The resolver treats active overrides as external-ID matches. The source's
override-event count and latest timestamp form a revision suffix on subsequent
promoted versions. Consequently, unchanged upstream bytes can be parsed and
promoted into a distinct immutable source run after a binding changes. The raw
snapshot keeps its upstream version and content hash.

When replay succeeds, normal promotion materializes the external ID on the
chosen canonical entity. Revocation removes both the current override and that
materialized mapping, records a revocation event, reopens the origin conflict,
and advances the replay revision. Automatic catalog sources are queued for
replay by the web action; manual sources require another explicit upload.

## Rationale

A review checkbox cannot teach future refreshes how to resolve the same record.
Conversely, mutating an active source run in place would make release membership
and provenance dishonest. A small explicit mapping supplies the missing
identity evidence, while a versioned replay preserves the existing immutable
promotion model.

Restricting both sides of a binding to facts retained on the conflict prevents
the administration form from becoming an unrestricted entity merge tool.
Keeping ordinary review separate preserves the valid decision that an upstream
record should remain skipped.

## Consequences

- Overrides repair identity only. They cannot change kinds, fields, recipes or
  other factual observations directly.
- Binding requires at least one external ID and one candidate entity; other
  conflict types continue to offer review notes only.
- Revocation can affect later catalog composition because the next replay may
  skip observations that depended on the removed identity.
- Replay creates another source run with the same content hash and a distinct
  effective version; snapshot storage does not duplicate identical bytes.
- Manual operators must retain or reselect the source file to replay it.
