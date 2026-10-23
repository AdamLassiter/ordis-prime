# 0096: Drop rewards bridge through WFCD item identities

Status: accepted

## Context

Drop tables identify rewards with hashes and incomplete name-based types, while
`warframe-items` provides canonical internal IDs and richer taxonomy. Importing
them independently created duplicate entities such as a generic drop-table
Orokin Cell beside the resource used by recipes. Name-only merging would also
incorrectly collapse legitimate pairs such as the Lex node and Lex weapon.

## Decision

Snapshot a reduced, canonical item-identity index with every drop payload. It
includes top-level items and parent-qualified embedded components. When a
reward name has one viable kind, emit its drop ID and all matching WFCD item IDs
on the same observation and use the item kind.

Promotion treats that explicit pair as a provider assertion. It moves a legacy
drop-only shell and its linked reward facts and private references onto the
typed item, then retires the shell. It does not use this repair for display-name
matches or identifiers from unrelated providers.

## Consequences

Recipes, drops, inventory and planning share one identity for resources,
arcanes, mods, blueprints and parts. Cross-domain equal names remain distinct.
The drop adapter now depends on availability of the item endpoint and the item
source must be imported before standalone drop promotion.
