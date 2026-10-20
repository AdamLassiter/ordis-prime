# 0075: Junction objectives use content identity

Status: accepted

## Context

The Wiki mission module identifies Junction nodes but does not contain their
entry tasks. Each of the 13 named Junction pages has a consistent
`Junction Tasks` table containing four prerequisites, a terminal `Complete the
Junction` action, hints and heterogeneous rewards. Row position is presentation,
not a durable identity: tasks can be reordered or replaced as the game changes.

Public task facts are useful before private progress exists. They answer what a
Junction asks of a player without falsely claiming that the application knows
which tasks the player has completed.

## Decision

Add an independent `warframe-wiki-junctions` MediaWiki adapter. Fetch all 13
named pages in one versioned snapshot, isolate only the task table and require
exactly four prerequisite rows per page. Exclude the location row, the terminal
completion action and reward cells.

Emit each task as an ordered `node-objective` fact with its plain-text label,
optional hint and exact page-revision citation. Derive its key from normalized
task content rather than its row number. Emit a source-owned node identity so
the source can be imported in any order and reconcile it with mission nodes by
canonical kind, name and slug.

Use a 75 percent shrinkage floor in addition to the fixed page and row-count
validation. Keep objective facts public and source-owned; do not add player
completion fields or fold them into node access in this change.

## Consequences

- Junction pages can display attributed tasks and hints from the same canonical
  nodes used by the star chart and acquisition data.
- Reordering preserves objective identity. Materially changing a task produces
  a new identity, preventing future private progress from attaching to different
  instructions merely because the row stayed in the same position.
- The adoption-time replay matched 13 existing nodes and promoted 52 objective
  facts with no conflicts.
- Rewards remain future typed facts because a single reward column mixes items,
  currencies and unlocks.
- Private per-objective completion and its contribution to Junction access need
  a separate player-state decision and implementation.
