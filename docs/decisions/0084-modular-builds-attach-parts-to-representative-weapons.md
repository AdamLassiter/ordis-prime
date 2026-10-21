# 0084: Modular builds attach parts to representative weapons

## Context

The catalog uses a Kitgun chamber or Zaw strike as the stable weapon identity
because those parts determine the named weapon family and valid broad loadout
slot. Grips, loaders and links are separate canonical components. Flattening a
whole assembly into a freeform configuration label would lose item links,
ownership checks and acquisition planning, while creating a synthetic weapon
entity for every combination would multiply identities the sources do not
publish.

## Decision

Keep the chamber or strike in the existing build-equipment slot and store the
remaining selected parts as children of that equipment row. A Kitgun accepts
exactly one `kitgun-grip` and one `kitgun-loader`; a Zaw accepts exactly one
`zaw-grip` and one `zaw-link`. Both search and writes derive the allowed roles
from the equipped weapon's cited canonical class, and writes also require the
selected entity's canonical role to match exactly.

Changing the representative weapon clears its modular parts along with its
mods and slot configuration. Modular selections participate in build revision,
immutable snapshots, draft and shared-snapshot cloning, acquisition goals and
portable profile schema 21. No backwards compatibility is retained for older
profile schemas during this pre-release phase.

## Consequences

- One canonical component cannot fill the wrong family or role, even through a
  forged server action.
- Shares and exports embed stable component references rather than display-only
  labels.
- Acquisition planning counts the representative and every selected component.
- The model can accept cited part-stat facts later without changing build
  ownership or composition identity.
- The application does not yet calculate the assembled weapon's derived stats,
  gilding state, polarity choices or naming; those remain explicit gaps.
