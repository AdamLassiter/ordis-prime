# 0023: Manual preview rolls back promotion

Status: accepted

## Context

Administrators need to inspect a manual source's resolver effects before it
changes the active catalog. A second, approximate validator would drift from
real promotion behavior, while retaining preview uploads would create snapshots
that were never accepted as source history.

## Decision

Run previews through the same parser and nested promotion transaction as an
import, then deliberately roll back the outer transaction. Report the resulting
entity, relationship, recipe, drop, enhancement-option, ranking and conflict
counts. Do not write a source refresh attempt or retain snapshot bytes.

Import remains a separate action that reads and validates the file again. The
preview result is informational rather than a signed approval of particular
bytes.

## Consequences

- Constraint errors, identity resolution and conflicts match real promotion.
- A preview cannot replace or partially expose active catalog state.
- Administrators must select the file again to import, making it possible for
  previewed and imported bytes to differ; the import therefore never trusts the
  preview.
- Preview currently consumes a synchronous web request like manual import.
