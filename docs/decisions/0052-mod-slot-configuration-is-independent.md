# 0052: Keep mod slot configuration independent from installed mods

Status: accepted; cited factory sets added separately by decision 0071

## Context

Forma changes an equipment slot, not the mod currently installed in it. Storing
slot polarity on a mod assignment would lose empty polarized slots and silently
move equipment configuration when a player moves a mod. Capacity rules also
distinguish normal, Aura, Stance and Exilus slots.

## Decision

Persist a mod-slot grid separately from positioned mod assignments. Each
configured position records a role and optional polarity. Empty configured slots
remain meaningful. Aura roles are accepted only on Warframes, Stance roles only
on melee equipment, and each equipment entry can have at most one of each
special role.

The grid is private player-authored build state. Preserve it through draft and
shared-build clones, immutable snapshots and portable profile schema version 14.
Clear it when the equipped canonical entity changes. Do not infer positioned
slot layouts from unpositioned factory-polarity sets.

## Consequences

- A future capacity evaluator can join a positioned mod to the configured slot
  at the same position without conflating their polarities.
- Empty Forma'd slots survive edits, cloning and export/import.
- The editor can describe custom slot layouts and show sourced factory role and
  count sets without conflating them, as specified by decision 0071. Exact
  source positions and item-specific slot restrictions remain future work.
- ADR 0053 subsequently implements polarity arithmetic. Whole-build capacity is
  still withheld until equipment-specific capacity rules are implemented and
  tested.
