# 0076: Junction progress references source content

Status: accepted

## Context

Junction objectives are public, source-owned facts whose stable keys derive
from normalized task text. Player completion is private state. Referencing a
transient fact-row UUID would break on every source refresh, while referencing
only row position could silently mark a replacement task complete.

Junction objectives are complete prerequisites for entering the Junction, so
they should participate in the same access derivation as quest, rank, item and
adversary evidence rather than becoming a page-only checklist.

## Decision

Store completed objectives by user, canonical node, source ID and
content-derived objective key. Also retain the objective label and completion
time as a recoverable snapshot of what the player actually marked. Absence is
incomplete for a signed-in player; signed-out reads expose no fabricated
private value.

Only an active objective can be changed through the application. Read models
join completion to active objectives by all three public identity fields. A
withdrawn or textually changed task therefore leaves its private row intact but
does not satisfy the current rule. If the exact task returns, its completion is
visible again.

Compose current objective states into the shared node-access function. Any
known incomplete objective blocks access, all current objectives complete
satisfy this evidence, and missing private state for a guest remains
conditional. Expose the same states in node details, star-chart filtering and
acquisition recommendations.

Include objective progress in portable profile schema 20. Import resolves the
node and requires the exact source/key pair to be active; missing tasks are
reported rather than guessed. No compatibility reader for earlier pre-release
profile schemas is retained.

## Consequences

- Player checklists and public Wiki facts can refresh independently without
  sharing ownership.
- A task replacement cannot inherit completion merely because it occupies the
  same row.
- Private history is retained for recovery and a possible task reappearance,
  while current access remains source-faithful.
- Junction rewards and automatic account-state import remain separate work.
