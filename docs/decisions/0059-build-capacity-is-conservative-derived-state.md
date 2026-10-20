# 0059: Build capacity is conservative derived state

Status: accepted

## Context

Update 38.5 raised unranked equipment capacity to 15 and distributes another
point every two ranks through rank 30. The official
[Update 38.5 notes](https://www.warframe.com/fr/patch-notes/switch/38-5-0)
give the rank-zero, Mastery Rank 4 example as 17 capacity. The official
[Warframe Wiki Mod reference](https://wiki.warframe.com/w/Mod) documents the
same minimum rule, continued capacity for rank-40 equipment and Legendary Rank
progression. The official [Mods Guide](https://www.warframe.com/en/news/mod-rehberi)
documents capacity upgrades, ordinary mod drain, and Aura and Stance bonuses.

Equipment rank, combined player progression, maximum equipment rank, installed
mods and slot configuration come from different ownership and provenance
boundaries. A plausible subtotal must not be presented as a complete build.

## Decision

Derive mod capacity when a build is read; do not persist it separately.

- Capacity at effective ranks zero through 30 is `15 + floor(rank / 2)`.
  Capacity above rank 30 equals the effective rank.
- Effective rank is the higher of current equipment rank and the player's
  combined Mastery/Legendary Rank, capped by sourced equipment maximum rank.
- A Reactor or Catalyst doubles equipment capacity before Aura or Stance
  bonuses are added.
- Negative polarity-adjusted drain is summed as bonus capacity. Positive
  adjusted drain is summed as used capacity.
- A total and remaining value exist only when base capacity and every installed
  mod's adjusted drain are known. A known base may still be shown alone.
- One missing rank input is sufficient only when the other has reached a known
  equipment maximum. Maximum rank is required when an effective rank above 30
  could otherwise be capped incorrectly.
- Operator Amps are excluded because they do not use the equipment mod-capacity
  system represented here.

## Consequences

- Drafts show used, total and remaining capacity without duplicating canonical
  facts or private progression state.
- Negative remaining capacity remains visible so historical or invalid builds
  are not silently normalized.
- Published snapshots retain the calculation visible when shared. Drafts are
  recalculated after player progression, configuration or catalog changes.
- Missing mod facts, positioned slot configuration, rank inputs or companion
  maximum ranks produce an explicit partial or unknown result. Unpositioned
  factory-polarity sets are guidance rather than capacity inputs under decision 0071.
