# 0074: Warframe rank gates use current availability

Status: accepted

## Context

Elite Sanctuary Onslaught requires both The New Strange and a level-30
Warframe. Quest completion is durable discovery progress, but having a
currently usable Warframe at that rank is separate private state. Mastery and a
historical mastered flag cannot prove that a suitable Warframe remains in the
player's inventory, while build drafts are plans rather than authoritative
collection state.

## Decision

Represent the complete Wiki expression as a cited quest relation plus a numeric
Warframe-rank node fact. Store an optional private highest rank among Warframes
the player currently has available, bounded from 0 through 30 and included in
profile transfer.

Compose the two clauses through the shared node-access derivation. A recorded
rank below the requirement blocks access, a sufficient rank is met, and an
unrecorded rank keeps the node conditional. Do not infer this setting from
mastery history, inventory counts or build drafts.

## Consequences

- Elite Sanctuary Onslaught no longer loses its quest prerequisite merely
  because its second clause was previously unsupported.
- The planner, star chart and node page explain the same cited rank condition.
- Players must update this small private setting when their highest currently
  available Warframe rank changes.
- Equipment-specific restrictions beyond Warframe rank remain future typed
  predicates rather than generic prose.
