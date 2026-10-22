# 0092: Provider taxonomy and embedded drops are promoted together

## Context

The aggregate WFCD catalog contains far more category/type combinations than
the initial domain mapping covered. It also embeds acquisition records on many
items and their components. Treating unfamiliar but understood categories as
`unknown`, or ignoring those embedded drops, makes Codex filters weak and leaves
valid parts such as Nokko Neuroptics without sources.

## Decision

Map reviewed WFCD categories and types at the adapter boundary into canonical
challenge, cosmetic, decoration, gear, misc, mod, relic and existing gameplay
kinds. Join the drop-data payload with its maintained mod-location index so
drop-only rewards receive a conservative typed fallback. Emit embedded item and
component drop records from the item adapter with their original location,
rotation, chance and evidence.

Keep provider terms out of consumers. Unknown future taxonomy still fails
closed or remains unknown until reviewed. Parser versions change whenever these
semantics change so retained bytes are replayed.

## Consequences

- Active catalog kinds and entity filters are meaningful across the current
  dataset.
- Item pages and the planner see acquisition records absent from mission reward
  tables.
- The same canonical drop can have independent evidence from multiple sources.
- New provider categories still require an explicit mapping decision.
