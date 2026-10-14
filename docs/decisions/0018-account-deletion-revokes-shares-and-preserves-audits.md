# ADR 0018: Revoke shares and preserve audits on account deletion

## Decision

Self-service account deletion removes credentials, sessions and all private
player state in one immediate transaction. It explicitly deletes immutable
build-share snapshots before their source builds, rather than allowing the
share foreign key to become anonymous. The final administrator cannot delete
their account.

Conflict-review events retain an `actor_name` snapshot. Their user foreign key
becomes null on account deletion, so the operational audit remains readable
without retaining an account solely for referential integrity.

## Rationale

An account-deletion control that leaves public capability URLs usable does not
match a player's reasonable expectation. Conversely, deleting source-review
history would weaken catalog accountability. Public shares are user-published
artifacts that should be revoked; administrative audit facts should remain with
minimal identifying context.

## Consequences

- A deleted account and its private state cannot be restored; profile export is
  the player's recovery path before deletion.
- Historical audit rows show the actor name but no longer link to an account.
- The active session plus an exact `DELETE` phrase authorizes deletion. Password
  re-entry remains a documented hardening gap.
- Inventory now cascades with user deletion consistently with other private
  player tables.
