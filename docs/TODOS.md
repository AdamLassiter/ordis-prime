# Todos and dynamic watches

Ordis Prime aims to combine ordinary player-authored tasks with dynamic tasks
and alerts derived from current game state. Both are private player state and
must never be embedded in catalog or provider records.

## Planner tasks

Authenticated players can create, complete, reopen and delete todos with an
optional note and calendar due date. Due dates are date-only values represented
at UTC midnight in SQLite; they are not notification instants. Every database
mutation includes the owning user ID so guessing another todo UUID cannot expose
or modify it. Item, discovery-topic, and node detail pages can create a task
linked to that canonical entity. The task renders an in-app link and carries a
portable entity reference in profile exports.

The task manager lives in Planner beside acquisition goals, missing
ingredients and mission recommendations. Entity shortcuts return there through
`/planner#tasks`. Alerts intentionally contains only automated
world-state watches and the alerts they produce, so player-authored work and
time-sensitive signals no longer compete in one queue.

A task with a due date may repeat every N days, weekly on its weekday, monthly
on its calendar date, monthly on its weekday occurrence, or yearly on its date.
Calendar dates are clamped when necessary: a task anchored to the 31st falls on
February's final day and returns to the 31st in March; a February 29 yearly task
similarly returns to its original date in leap years. The unchanged rule travels
with each occurrence, rather than deriving a new rule from a clamped date.
Completing an occurrence preserves it as history and creates the next open task
from the previous due date. A unique predecessor key makes repeated completion
requests—and reopening then re-completing an old occurrence—idempotent.

## Dynamic watches and alerts

World-state watches are rules over normalized window kind, label, state and node
fields, not raw WFCD JSON. A watch triggers when a matching window is active,
approaching activation, or approaching expiry. Lead time is configurable from
zero to seven days.

A watch may link to one canonical entity. Item pages use a currently matching
window's kind when one exists, otherwise creating an alert watch—or an event
watch for discovery entities—tied to that exact canonical subject.
Node pages create a Void Fissure watch tied to the exact canonical node. Both
match only when world-state normalization reconciles the window to that entity,
avoiding substring collisions. The linked entity is visible from the watch and
portable across installations. Optional normalized text fields further narrow
an exact entity watch; they remain the whole matching rule for unlinked watches.

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

Read notifications with a finite expiry are retained for 30 days after that
expiry by default, then pruned by the worker. Unread notifications and notices
without an expiry are never removed automatically. This restriction ensures
cleanup cannot delete the occurrence key while its window could still match and
therefore cannot generate a duplicate notification. The retention duration is
configurable with `ORDIS_NOTIFICATION_RETENTION_MS`; zero removes read notices
on the first worker pass after they expire.

## Current limits

- Static todos and watch rules are portable; generated notification history is
  deliberately installation-local.
- Each detail-page shortcut chooses a conservative initial window kind and must
  be edited when the player wants another kind. Only provider windows that
  expose a subject label or identifier can match non-node links.
- Recurrence is date-based and deliberately has no time-of-day or timezone.
  Rules are anchored by the initial due date; the create form does not offer a
  separate weekday or month-day picker. There are no subtasks, tags or ordering controls. A
  todo can link to one canonical entity but cannot yet carry multiple targets.
- Web push and webhooks remain later opt-in delivery channels.

The acquisition planner separately surfaces active or upcoming world-state
windows on recommended nodes. Those are derived, expiring suggestions rather
than persisted todos or alerts.
