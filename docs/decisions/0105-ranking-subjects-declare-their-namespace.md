# 0105: Ranking subjects declare their namespace

## Status

Accepted.

## Decision

Manual ranking schema version 2 declares one `subject.sourceId` and
`subject.namespace` for the set. Each entry supplies only the value in that
namespace. Ranking identity is no longer implicitly a WFCD `uniqueName`.

## Consequences

- One reviewed format can rank equipment, abilities, or later subject types.
- A typo cannot silently fall back to a similarly named entity; unresolved
  identifiers remain promotion conflicts.
- Version 1 is rejected. There is no pre-release compatibility requirement.
