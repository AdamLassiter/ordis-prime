# 0033: Prune only read, expired notifications

Status: accepted

## Context

Player notifications also serve as the durable deduplication record for a watch
and normalized occurrence. Deleting an alert merely because it is old or over a
count limit could let the still-current occurrence match again and recreate the
same alert. Keeping every notification forever, however, makes routine polling
produce unbounded player history.

## Decision

The worker may delete a notification only when the player has read it, its
matching window has a finite expiry, and that expiry is older than a configurable
retention duration. The default duration is 30 days. Unread alerts and alerts
without a finite expiry remain until the player deletes their watch or account.

Expiry is the safety boundary: current-world-state reads already exclude an
expired window, so removing its notification cannot make that occurrence match
again. A zero duration still waits until expiry rather than treating a read as
permission to discard the deduplication key immediately.

## Consequences

- Ordinary read alert history is bounded by time once occurrences finish.
- Cleanup cannot cause duplicate alerts for current or non-expiring windows.
- Players do not lose unread alerts to an automatic count cap.
- A permanently unread or non-expiring stream can still grow without bound;
  separating occurrence delivery records from displayed notifications would be
  required to safely impose a hard cap later.
