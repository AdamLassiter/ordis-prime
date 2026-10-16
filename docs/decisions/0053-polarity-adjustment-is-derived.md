# 0053: Derive polarity-adjusted mod drain

Status: accepted

## Context

ADR 0050 derives ranked mod drain from sourced mod facts, and ADR 0052 records
the player's slot role and polarity separately. The remaining adjustment is a
game rule rather than new player or catalog state. Digital Extremes' official
[Mods Guide](https://www.warframe.com/en/news/guide-des-mods) specifies the
rounding behavior, while the official
[Polarity reference](https://wiki.warframe.com/w/Polarity) documents the Any
polarity's exception for Umbra.

## Decision

Derive an adjusted value only when a positioned mod has known ranked drain and
polarity plus an explicitly configured slot at the same position.

- A normal or Exilus matching polarity halves drain, rounded up.
- A normal or Exilus mismatch adds 25 percent, rounded up.
- A matching Aura or Stance slot doubles the capacity bonus.
- An Aura or Stance mismatch provides 80 percent of the bonus, rounded down.
- The `aura` source value represents the Any polarity and matches every polarity
  except Umbra.

An explicitly configured unpolarized slot leaves ranked drain unchanged. An
absent slot configuration stays unknown. The provider's `universal` mod value is
not a selectable equipment-slot polarity; it describes special zero-drain mod
records rather than a Forma polarity.

## Consequences

- Drafts and immutable shares can explain both raw ranked drain and its slot
  adjustment without persisting a derived value.
- Catalog corrections affect private drafts on their next read, while published
  snapshots retain the calculation visible when shared.
- Contradictory special-mod placement returns no adjusted result instead of
  inventing capacity.
- Whole-build capacity still requires sourced item-specific rank/capacity rules
  and a defined aggregation of ordinary drain with Aura or Stance bonuses.
