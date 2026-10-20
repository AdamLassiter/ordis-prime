# 0071: Factory polarities are cited sets, not invented positions

Status: accepted

## Context

The structured WARFRAME Wiki weapon and Warframe modules publish normal-slot
polarities and, where applicable, Aura, Stance and Exilus polarities. They do
not publish stable grid positions. The same canonical hybrid weapon can also
have separate source records for configurations such as Primary and Melee, with
different special-slot facts.

Build capacity needs a polarity at a specific mod position. Assigning an ordered
source array to arbitrary positions would turn a useful cited fact into a false
layout. The module schema gives `Polarities` a nil default and its own consumers
treat a missing value as an empty table, so omission has a defined empty-set
meaning rather than representing unknown data.

## Decision

Import one complete, cited factory-polarity set per structured equipment source
record. Each set contains role, canonical polarity and quantity facts, may carry
a source configuration label, and may be empty either by an empty array or the
schema-defined omitted-field convention. Preserve multiple
configuration records that resolve to the same canonical equipment entity.

WFCD companion records may contribute normal-role sets when their `polarities`
field is present. Do not turn an omitted companion field into an empty set, and
do not import partial WFCD Warframe or weapon sets that omit special-slot roles.

Show these sets on catalog and build pages as setup guidance. Keep the
player-authored positioned mod-slot grid independent, and continue to derive
capacity only from that explicit positioned state. Do not assign source counts
to positions or mutate a draft when the catalog refreshes.

## Consequences

- Catalog and build views distinguish sourced factory state, including “none,”
  from absent data.
- Hybrid equipment can show distinct Primary and Melee sets without collapsing
  one into the other.
- Immutable shared builds retain the cited guidance visible when published;
  drafts read the current active source sets.
- Live adoption imported 737 weapon sets and 124 Warframe or Archwing sets with
  no resolver conflicts; 72 weapon records resolve to an empty set under the
  source schema.
- A fresh live WFCD import adds 34 disclosed companion sets with no resolver
  conflicts; other companion records remain unknown rather than empty.
- Exact factory positions remain unavailable. Players position current or
  Forma-modified polarities themselves before capacity arithmetic uses them.
