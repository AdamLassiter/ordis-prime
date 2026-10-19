# 0068: Node prerequisites compose with private completion

Status: accepted

## Context

Structured Wiki mission records contain prose requirements. Some expressions
state only completed quests, while Vehrvod District currently states two
conditions: completion of The Hex and completion of Lower Vehrvod. Importing
only the quest clause would incorrectly claim that the modeled requirement is
complete; ignoring the whole expression would discard a useful, verifiable
route through the star chart.

Node completion now has a dedicated private state model. That makes a complete
quest-and-node expression representable without treating graph adjacency as
player progress.

## Decision

Extend the mission adapter's anchored allow-list to exact node-completion-only
expressions and the exact quest-plus-node-completion shape used by Vehrvod
District. Resolve every wiki link as exactly one known quest or mission node,
and emit a cited `requires` relation for every condition only when the entire
expression matches a supported shape.

At read time, evaluate node prerequisites from `player_node_progress` and all
other discovery prerequisites from `player_discovery_progress`. An absent node
completion row is `incomplete`, while absent guest state remains unknown and
therefore conditional. Use the same result in node pages, the star chart and
the acquisition planner.

## Consequences

- Vehrvod District can be shown as blocked until both The Hex and Lower Vehrvod
  are complete.
- The source relation remains distinct from the player's private completion.
- Mixed item, rank, adversary or otherwise unsupported expressions still emit
  no partial access relations.
- Supporting another prose shape requires a fixture and an explicit parser
  change; arbitrary article prose is not interpreted.
