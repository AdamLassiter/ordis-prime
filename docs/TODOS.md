# Todos and dynamic watches

Ordis Prime aims to combine ordinary player-authored tasks with dynamic tasks
and alerts derived from current game state. Both are private player state and
must never be embedded in catalog or provider records.

## Static todos

Authenticated players can create, complete, reopen and delete todos with an
optional note and calendar due date. Due dates are date-only values represented
at UTC midnight in SQLite; they are not notification instants. Every database
mutation includes the owning user ID so guessing another todo UUID cannot expose
or modify it. Item, discovery-topic, and node detail pages can create a task
linked to that canonical entity. The task renders an in-app link and carries a
portable entity reference in profile exports.

A task with a due date may repeat at an explicit interval of 1 to 3,650 days.
Completing an occurrence preserves it as history and creates the next open task
from the previous due date. A unique predecessor key makes repeated completion
requests—and reopening then re-completing an old occurrence—idempotent.

## Dynamic watches and alerts

World-state watches are rules over normalized window kind, label, state and node
fields, not raw WFCD JSON. A watch triggers when a matching window is active,
approaching activation, or approaching expiry. Lead time is configurable from
zero to seven days.

A watch may link to one canonical entity. Item pages create an editable event
watch whose label initially contains that item's name. Node pages create a Void
Fissure watch tied to the exact canonical node; it matches only when world-state
normalization reconciles the window to that node, avoiding substring collisions.
The linked entity is visible from the watch and portable across installations.
For non-node entities the link is context, while the normalized text fields
remain the explicit matching rule.

The worker evaluates enabled rules after every successful snapshot promotion.
It hashes the normalized occurrence fields and creates at most one notification
per watch and occurrence, even when polling observes it repeatedly. Watch
creation also evaluates the current snapshot immediately. Notifications are
private, can be marked read, and do not silently complete static todos. Deleting
a watch deletes its generated alerts.
Watches can be paused without losing their definition or existing notification
history. Editing preserves watch identity and alert history, while resuming or
saving an enabled watch immediately evaluates the current snapshot. Existing
occurrence keys remain deduplicated after an edit.

## Current limits

- Static todos and watch rules are portable; generated notification history is
  deliberately installation-local.
- Each detail-page shortcut chooses a conservative initial window kind and must
  be edited when the player wants another kind. Non-node links cannot become an
  exact match until world-state reward/subject identities are normalized.
- Recurrence is a fixed day interval; calendar rules such as weekdays or “first
  Sunday” are not modeled. There are no subtasks, tags or ordering controls. A
  todo can link to one canonical entity but cannot yet carry multiple targets.
- Notification retention is not configurable. Web push and webhooks remain
  later opt-in delivery channels.

The acquisition planner separately surfaces active or upcoming world-state
windows on recommended nodes. Those are derived, expiring suggestions rather
than persisted todos or alerts.
