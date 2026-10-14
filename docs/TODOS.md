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

## Dynamic watches and alerts

World-state watches are rules over normalized window kind, label, state and node
fields, not raw WFCD JSON. A watch triggers when a matching window is active,
approaching activation, or approaching expiry. Lead time is configurable from
zero to seven days.

The worker evaluates enabled rules after every successful snapshot promotion.
It hashes the normalized occurrence fields and creates at most one notification
per watch and occurrence, even when polling observes it repeatedly. Watch
creation also evaluates the current snapshot immediately. Notifications are
private, can be marked read, and do not silently complete static todos. Deleting
a watch deletes its generated alerts.

## Current limits

- Static todos and watch rules are portable; generated notification history is
  deliberately installation-local.
- There are no recurring schedules, subtasks, tags, ordering controls or links
  from a todo to canonical catalog entities.
- Watches cannot yet be paused or edited, and notification retention is not
  configurable. Web push and webhooks remain later opt-in delivery channels.

The acquisition planner separately surfaces active or upcoming world-state
windows on recommended nodes. Those are derived, expiring suggestions rather
than persisted todos or alerts.
