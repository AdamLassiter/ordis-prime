# 0085: Game inventory import is an explicit monotonic merge

## Context

Warframe's mobile inventory response contains stable `/Lotus/...` `ItemType`
paths that correspond to the WFCD `uniqueName` identifiers already attached to
canonical entities. Cephalon Kronos demonstrates the breadth of useful owned
item arrays in this response, but obtains account credentials by scanning a
running game process and delegates API access to a separately licensed helper.
Ordis Prime is a self-hosted web application: accepting or extracting those
credentials server-side would create a materially different security boundary.

The response also contains account and session-adjacent data that the catalog
does not need. Persisting the raw response would increase privacy and breach
impact without helping ownership joins.

## Decision

Accept only an explicit JSON file uploaded by the signed-in player, with a 10 MB
file boundary. Parse a fixed allow-list of owned equipment, upgrade, resource,
consumable and recipe arrays plus Helminth `ConsumedSuits`. Reject malformed
present arrays and excessive records or quantities. Ignore every other field
and discard the uploaded bytes after the request.

Resolve `ItemType` only through an exact active `wfcd-items:uniqueName`
identifier. Never fall back to localized or display names. For each resolved
path, raise the existing owned count to the larger of its manual and imported
values; never lower it. A confirmed consumed suit can set `subsumed` true.
Preserve built/wanted counts, mastery flags and notes. Apply all resolved
changes in one transaction and report unmatched path counts.

This parser was informed by the MIT-licensed Cephalon Kronos inventory parser
and independently implemented against Ordis Prime's domain boundary. Its
process-memory scanner and Commons-Clause helper are not included.

## Consequences

- Raw account identifiers and session credentials are neither needed nor
  retained by Ordis Prime.
- Imported ownership composes immediately with the planner, star chart and
  build acquisition views through existing private inventory state.
- Reimporting a snapshot is idempotent, and an old or partial snapshot cannot
  erase a larger manual count.
- Selling an item or correcting an inflated count still requires manual input;
  the import is evidence accumulation, not authoritative synchronization.
- Mastery, ranks, Forma, modular assemblies, Rivens and other instance details
  remain unimported until they have explicit canonical and privacy semantics.
