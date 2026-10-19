# 0062: Abilities are first-class discovery entities

Status: accepted

## Context

The discovery atlas should reveal systems a player did not know existed, but
abilities were only implicit in Warframe names and external Wiki links. The
official Wiki's versioned
[`Module:Ability/data`](https://wiki.warframe.com/w/Module:Ability/data)
contains current and archived ability records, descriptions and a `Powersuit`
owner. That owner string alone does not distinguish Warframes, Archwings,
Necramechs and Helminth abilities.

Treating abilities as generic mechanics would make filtering and future build
relationships ambiguous. Treating every owner as a Warframe would corrupt
identity.

## Decision

Add `ability` as a canonical and progress-trackable discovery kind. Add an
independent `warframe-wiki-abilities` adapter that snapshots both the ability
and Warframe modules at exact revisions and parses their literal Lua tables
without executing provider code.

Import only the current `Ability` table, not `Archived`. Import each ability's
name and cleaned in-game description. Validate owner names against the current,
non-ignored `Warframes` and `Archwings` tables before emitting an attributed
`involves` relation from that typed powersuit to the ability. Keep abilities
whose owner family is not modeled, but omit their owner relation. Apply the
standard automatic-source shrinkage guard and daily independent schedule.

## Consequences

- Abilities are searchable, linkable atlas topics with private discovery
  progress and exact revision citations.
- Warframe and Archwing catalog pages expose their ability neighbors through
  the existing relation read model; no build-specific copy is introduced.
- The adoption-time live import produced 331 canonical ability entities and
  278 typed ownership relations with no resolver conflicts alongside WFCD.
- Helminth and Necramech ownership remains visibly incomplete until those
  equipment families receive canonical kinds; it is not coerced into Warframe.
- Archived abilities can be modeled later as historical state without mixing
  them into the current catalog.
