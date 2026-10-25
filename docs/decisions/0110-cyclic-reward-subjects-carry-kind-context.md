# 0110: Cyclic reward subjects carry kind context

## Status

Accepted.

## Context

Circuit source records name their rewards but do not provide a stable catalog
identifier. Name-only resolution is safe while a name is unique, but legitimate
same-name entities make it ambiguous. Chroma is both a Warframe and an enemy;
Titania is both a Warframe and a node. The previous resolver therefore left
those Circuit rewards unlinked rather than guessing.

## Decision

Cyclic reward subjects may declare an expected canonical entity kind in
addition to external identifiers and their display label. Resolve exact external
identifiers first, then exact names and aliases within that kind. Adapters must
provide kind context only when the source structure establishes it: Normal
Circuit primaries are Warframes, their included augments are mods, and Steel
Path Circuit primaries are Incarnon Genesis resources.

If a supplied external identifier resolves to the wrong kind, or an untyped
label has multiple candidates, retain the label without a link and create an
ingestion conflict containing the source record and candidates. A label with no
catalog candidate remains unlinked without manufacturing a conflict.

## Consequences

- Same-name entities remain distinct searchable catalog records.
- Circuit links are deterministic without a global preference for one kind.
- Ambiguous source contexts remain reviewable instead of silently selecting a
  candidate.
- Changing subject-kind knowledge changes parser output, so the Circuit parser
  version must advance and the source must refresh before stored null links are
  repaired.
