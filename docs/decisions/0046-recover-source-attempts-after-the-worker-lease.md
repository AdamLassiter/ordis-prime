# 0046: Recover source attempts after the worker lease

Status: accepted

## Context

Source refresh attempts begin before network access and normally finish in the
same process. A process termination can leave an attempt marked `running` even
after its database job lease expires. Retention deliberately protects running
attempts and their raw snapshots, so such a row would otherwise become a
permanent and misleading retention root.

There is no durable refresh-process identity to prove that a shorter-lived row
has stopped. Recovering it before the job lease expires could race a legitimate
request owned by another worker.

## Decision

At the start of every worker cycle, mark every running source attempt whose
start time is at least one maximum worker lease old as failed. Use the same
lease duration that guards the longest configured provider request, and record
the worker cycle time plus a bounded abandonment error.

Preserve any snapshot path and normalized record count already attached to the
attempt. Run recovery before source-operation pruning and raw-snapshot garbage
collection, so recovered evidence follows the ordinary bounded audit lifecycle.

## Consequences

- A terminated worker cannot leave an operation permanently running or retain
  its snapshot forever.
- Recovery is idempotent and does not alter succeeded or failed operations.
- A genuinely live operation is protected for the full worker lease, even if
  its configured request timeout is shorter.
- Manual uploads share the same attempt table but no dedicated lease. Their
  one-megabyte limit makes the worker lease a conservative recovery window;
  durable asynchronous manual imports remain a separate future improvement.
