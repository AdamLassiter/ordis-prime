# 0120: Bulk progress distinguishes Star Chart modes

## Status

Accepted.

## Context

Established players need a practical way to seed private progress instead of
editing hundreds of records individually. Progression topics previously had
only per-record controls. Star Chart completion supported a planet form, but a
single completion bit could not distinguish the normal chart from Steel Path
and there was no whole-chart action.

Normal and Steel Path clears are independent player claims. Neither is sourced
catalog truth, and Steel Path completion must not satisfy normal-mode access
requirements merely because both refer to the same canonical node.

## Decision

Add an authenticated action that atomically marks every active discovery topic
completed. It covers exactly the allow-listed Progression kinds and remains
private to the current account.

Key node completion by user, canonical node, and mode (`normal` or
`steel-path`). Preserve the first completion time independently for each mode.
The Star Chart exposes explicit complete actions for the whole chart and the
current planet in either mode, while its planet editor and node detail editor
can set both modes independently. Normal-mode progress alone continues to
satisfy sourced node prerequisites.

Portable profile schema 23 includes the completion mode on every node-progress
entry. The database migration assigns existing completion rows to `normal`.

## Consequences

- A player can seed all Progression, a whole chart, or one planet without
  repeated per-record edits.
- Normal and Steel Path completion never overwrite one another.
- Whole-chart and planet actions resolve their scope from active canonical data
  on the server; client-supplied slugs cannot widen the operation.
- The checkbox editor still submits an explicit planet scope atomically, so an
  omitted checkbox means incomplete only within that displayed planet and mode.
- Profile schema 22 is intentionally not accepted before stable release.
