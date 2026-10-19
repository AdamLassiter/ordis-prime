# 0070: Bulk node completion replaces only the visible scope

Status: accepted

## Context

Recording one node at a time is impractical when a player first brings an
established account into Ordis Prime. The star chart already has useful text,
reward, access and completion filters, so those results provide a natural
working set. A bulk operation must not silently clear nodes hidden by a filter,
and a partially applied submission would leave private progress difficult to
audit.

## Decision

Make every node in the currently rendered, filtered chart an explicit member of
the submitted scope. Checked members are completed and unchecked members are
incomplete. Nodes outside that submitted scope are unchanged.

Apply the complete submitted scope in one database transaction. Resolve every
slug to an active canonical node before writing anything, reject duplicates and
out-of-scope completed values, and preserve the original completion timestamp
when an already-completed node remains checked. Keep the single-node editor on
node detail pages as a thin use of the same bulk persistence boundary.

## Consequences

- Players can use planet, text, reward, access and completion filters as safe
  batches without affecting hidden nodes.
- Unchecking a visible node is an intentional incomplete write, not an omitted
  form value inferred across the whole catalog.
- A retired, unknown or malformed node invalidates the whole batch rather than
  producing a partial update.
- This is manual private state entry. Automatic account-state import and
  objective-level Junction progress remain separate future capabilities.
