# 0104: Cyclic rewards are static schedule facts

## Status

Accepted.

## Decision

Recurring reward schedules are promoted with the static source run that states
their epoch, interval, phase count, selection rules, and phase choices. The
database stores source phase indices and optional canonical reward links. Read
models derive current and next absolute windows from those facts at query time.

Derived windows may participate in the shared watch engine, but they are not
copied into polled world-state snapshots. Selectable reward paths remain
distinct from random drops and do not enter node recommendation scoring.

## Consequences

- A schedule refresh is auditable at the exact Wiki revision and rolls back with
  the rest of that static source promotion.
- Inserted phases can preserve an upstream epoch offset; row order is never used
  as an implicit clock.
- Catalog, planner, timer, and notification views share one schedule model.
- The UI can show unresolved source labels, but only unambiguous exact canonical
  matches become links or entity-specific planner opportunities.
