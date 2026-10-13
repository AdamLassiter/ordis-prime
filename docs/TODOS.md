# Todos and dynamic watches

Ordis Prime aims to combine ordinary player-authored tasks with dynamic tasks
and alerts derived from current game state. Both are private player state and
must never be embedded in catalog or provider records.

## Static todos

Authenticated players can create, complete, reopen and delete todos with an
optional note and calendar due date. Due dates are date-only values represented
at UTC midnight in SQLite; they are not notification instants. Every database
mutation includes the owning user ID so guessing another todo UUID cannot expose
or modify it.

## Intended dynamic behavior

World-state watches will be rules over normalized window kinds and fields, not
raw WFCD JSON. A worker will evaluate enabled rules after snapshot promotion and
create deduplicated in-app notifications. Completing a notification should not
silently complete a static todo: the two express different intent.

## Current limits

- Static todos are not included in portable profile exports yet.
- There are no recurring schedules, subtasks, tags, ordering controls or links
  from a todo to canonical catalog entities.
- Dynamic watches and in-app notification delivery are the next implementation
  slice; web push and webhooks remain later opt-in delivery channels.
