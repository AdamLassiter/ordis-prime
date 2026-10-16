# 0051: Record equipment rank as player build state

Status: accepted

## Context

Available mod capacity depends on the configured item's current rank, capacity
upgrade and item-specific rules. The maintained WFCD item feed currently
provides neither equipment maximum level nor capacity for the relevant
Warframe and weapon records. Treating every item as rank 30 would be wrong for
items that can reach rank 40, while deriving rank from Forma count would confuse
two independent pieces of player state.

## Decision

Store an optional current rank on each private build equipment entry. Accept
integer values from 0 through 40, the range needed by current equipment, but do
not interpret 40 as the maximum for every item. Clear rank alongside other
item-specific configuration when the equipped entity changes.

Carry rank through build clones, immutable share snapshots and portable profile
schema version 13. Keep it absent when the player has not supplied it. Do not
calculate total capacity until a source adapter supplies item-specific maximum
rank rules and slot polarity semantics are represented.

## Consequences

- Partial and in-progress builds can distinguish unranked equipment from a
  rank-30 or rank-40 configuration.
- Forma count remains an audit-friendly configuration fact rather than an
  unreliable proxy for rank.
- The application still refuses to display a whole-build capacity total from
  incomplete evidence.
- A future sourced maximum can tighten validation without changing the meaning
  of the player-authored current-rank field.
