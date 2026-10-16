# 0054: Store equipment maximum rank as a canonical sourced field

Status: accepted

## Context

Build drafts now retain a player's current equipment rank, but maximum rank is
an item fact. Assuming 30 would reject valid rank-40 equipment; inferring 40
from the entered current rank would accept impossible states and fail for an
unranked exceptional item. The maintained WFCD aggregate currently omits both
maximum level and capacity for relevant equipment records.

## Decision

Add optional canonical `equipmentMaxRank` to Warframe, weapon, companion and
Archwing entities. Accept integer values from 30 through 40 through the
source-neutral observation pipeline and factual overlays. Retain field-level
provenance and use normal source priority, promotion, withdrawal and fallback
semantics.

Build equipment reads expose the sourced maximum and reject a player-authored
current rank above it. Unknown maximum rank remains absent and retains the broad
0-through-40 input guardrail. Do not derive the field from item names, weapon
classes or Forma count.

## Consequences

- Manual and future MediaWiki adapters can compose the same cited fact without
  changing build code.
- Catalog detail pages explain the active maximum-rank fact.
- Corrected active evidence immediately tightens private build validation;
  immutable snapshots retain the maximum visible when they were shared.
- Whole-build available capacity remains absent until the active catalog has
  enough maximum-rank coverage for an honest calculation.
