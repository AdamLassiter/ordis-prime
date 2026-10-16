# 0050: Derive ranked mod drain without persisting it

Status: accepted

## Context

Builds persist a selected mod and optional rank. ADR 0049 adds sourced maximum
rank, base drain and polarity to the canonical mod. Ranked drain is therefore a
function of current catalog evidence and private rank selection, not new player
state. Persisting it would become stale after a cited correction.

Equipment slot polarities are not modeled yet. Applying a matching or
mismatching polarity adjustment without that state would produce a fictional
whole-build capacity result.

## Decision

Reject a selected rank above the mod's current sourced maximum when that maximum
is known. Continue accepting an optional rank for mods whose maximum is unknown.

Derive unpolarized drain when both rank and base drain are known. Positive base
drain gains one drain per rank; negative aura and stance values lose one per
rank, representing their increasing capacity bonus. Expose the sourced maximum,
base drain, polarity and derived drain in hydrated drafts and immutable share
snapshots. Do not persist the derived value in build tables.

## Consequences

- Invalid known ranks fail at the server data-access boundary.
- Draft and shared-build views can explain each known mod's raw capacity effect.
- Catalog corrections affect private drafts on their next read; an already
  published immutable snapshot retains the values visible when shared.
- Whole-build used/available capacity remains intentionally absent until slot
  polarity, aura/stance placement and related equipment rules are represented.
