# 0047: Keep world-state observation time monotonic

Status: accepted

## Context

World-state versions are immutable, but the provider or an intermediate cache
can return a valid older payload after a newer snapshot has already become
active. Reactivating that payload would rewind timers and availability without
any parsing or database failure. A repeated historical version was especially
dangerous because the promotion path explicitly made an existing snapshot
active again.

Retrieval time does not establish freshness: a stale payload can be retrieved
now. The provider-declared observation time is the source-neutral ordering fact
available to promotion.

## Decision

For each world-state source, reject a candidate whose observation time is older
than the active snapshot's observation time. Also reject reactivation of any
previously imported inactive version while another snapshot is active.

Treat the already-active version with the same content hash as an idempotent
success. Preserve the existing version/hash collision check. All checks execute
inside the promotion transaction, so rejection leaves active state unchanged
and the refresh lifecycle records the failed attempt and candidate count.

## Consequences

- A stale provider or cache response cannot rewind current timers.
- Retrying the active payload remains harmless.
- Historical snapshots stay available for audit but cannot be promoted over a
  current snapshot.
- A legitimate provider correction must have an observation time equal to or
  newer than the active snapshot; there is no operator rollback feature yet.
