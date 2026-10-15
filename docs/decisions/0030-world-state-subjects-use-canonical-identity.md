# 0030: World-state subjects use canonical identity

Status: accepted

## Context

Node-linked watches already compare a reconciled node identity, but item-linked
watches used a label substring. “Forma” could therefore match “Forma Blueprint,”
and a catalog link on the rule was only contextual. WFCD world-state rewards
often provide both a display label and the same `uniqueName` used by the static
item dataset.

## Decision

Availability observations may contain a list of source-neutral subjects, each
with a display label and optional external identifiers. Promotion preserves all
labels, resolves identifiers first, and falls back only to one exact active name
or alias match. Ambiguous and missing labels remain unresolved.

Resolved subjects are stored as a many-to-many link from the immutable dynamic
snapshot window to canonical entities. A linked non-node watch requires that
canonical subject; text filters can narrow it further but cannot substitute a
substring match. Node watches retain their separate exact node reconciliation.

The WFCD adapter currently emits subjects from alerts, event descriptions and
rewards, and Void Trader inventory. Catalog shortcuts choose the kind of a
currently matching window when possible, then default to alert watches for
ordinary items and event watches for discovery kinds.

## Consequences

- Item alerts no longer trigger on merely similar reward text.
- Timer cards can navigate directly from a live reward or event to its catalog
  entry while still displaying provider labels that did not resolve.
- Exact matching depends on the static catalog having been imported and on the
  provider exposing a usable identifier or unambiguous label.
- Subject links belong to dynamic snapshots; they do not become catalog facts
  or alter canonical identity.
