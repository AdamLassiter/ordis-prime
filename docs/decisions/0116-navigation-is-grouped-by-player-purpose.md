# 0116: Navigation is grouped by player purpose

## Status

Accepted.

## Context

The primary navigation mixed public references, private planning tools,
editorial comparisons, market analysis, and account operations in access-based
arrays. Several atmospheric labels also required prior product knowledge to
understand. As the number of destinations grew, that ordering made related
workspaces harder to scan.

## Decision

Use direct workspace names and organize destinations by the kind of information
or action they provide:

1. Codex, Progression, Star Chart, Cycles, and Alerts cover game knowledge,
   progress, locations, and changing world state.
2. Arsenal, Tier Lists, and Market cover loadouts and equipment evaluation.
3. Planner and Inventory cover the player's acquisition intent and possessions.
4. Provenance, Crew, Operator, and Sign Out cover evidence and account
   operations.

Account-only links are omitted when signed out, but the remaining destinations
retain this relative order and grouping. Provenance belongs to the final
operations group even though it remains publicly readable. Page eyebrows,
descriptions, and current documentation use the same direct workspace names.
Route paths and precise data terms such as provider manifest or consensus score
do not change merely because a tab label changed.

## Consequences

- The navigation can be understood without translating in-world synonyms.
- Visual dividers communicate the groups while source order remains meaningful
  without styling.
- Access control changes which links are present, not where unrelated links
  move.
- The navigation remains horizontally scrollable at widths where all groups do
  not fit.
