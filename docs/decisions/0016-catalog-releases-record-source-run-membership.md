# ADR 0016: Record source-run membership in every catalog release

## Decision

Promoting a static source creates an immutable membership row for each currently
active static source run in the new catalog release. The newly promoted run
replaces its source's previous member; runs from all other sources carry forward.

Mutable source-run statuses remain the current query selector. Release
membership is the audit record describing what the composed catalog contained
at promotion time.

## Rationale

A release identifier without its constituent source versions cannot reproduce
or explain a cross-source view. Inferring old membership from current `active`
flags is impossible after the next refresh. Explicit membership makes the
release meaningful while preserving the simple and well-tested active-run read
path.

## Consequences

- The data-source page can show one release ID with every contributing version.
- A no-op refresh returns the existing active release rather than creating an
  identical release.
- Full candidate-wide validation and retention/pruning policy remain separate
  work. Historical releases currently retain their referenced runs.
- World state is excluded because it has independent snapshot cadence and
  activation semantics.
