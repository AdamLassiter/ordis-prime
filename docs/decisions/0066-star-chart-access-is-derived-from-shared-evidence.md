# 0066: Star-chart access is derived from shared evidence

Status: accepted

## Context

The acquisition planner already combines cited node relations, private
discovery progress and private Mastery Rank. The star chart now exposes those
same inputs, but storing a separate unlocked flag would drift whenever a source
refreshes or a player changes progress.

Graph connectivity is useful navigation evidence, but it does not prove that a
particular player has cleared the preceding node. Guests also lack the private
inputs needed to claim availability.

## Decision

Derive four star-chart states at read time:

- `blocked` when a known private prerequisite is incomplete or the recorded
  player rank is below the sourced gate;
- `conditional` when requirement evidence exists but the necessary private
  input is absent;
- `available` when every documented input is present and satisfied; and
- `unknown` when the catalog has no access evidence.

Use the same status semantics as the planner, expose the state on node cards and
the focused topology view, and allow it as a chart filter. Do not use
`connects-to` edges as implicit completion or access facts.

## Consequences

- A player can distinguish “not documented” from “documented but blocked” while
  looking for nodes with needed rewards.
- Source refreshes and private progress changes immediately affect the chart;
  there is no duplicated access state to migrate.
- A guest sees quest- or rank-dependent nodes as conditional, never as
  personally available.
- Junction objectives and compound conditions remain unknown until their own
  typed evidence and private inputs exist.
