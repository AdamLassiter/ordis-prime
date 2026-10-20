# 0072: Node item gates are cited quantity facts

Status: accepted

## Context

Some star-chart nodes require a quantity of an inventory item rather than a
completed quest or player rank. Treating this prose as a generic relation would
lose the quantity, while copying it into player state would mix sourced rules
with private inventory. Importing only the recognizable item link from a mixed
condition could also make a partially modeled gate look satisfied.

## Decision

Represent a complete item-only gate as a cited fact joining one canonical node,
one canonical inventory item and a positive required quantity. The Wiki mission
adapter emits source-owned resource identities for allow-listed linked items so
the fact can be imported before or after WFCD and still reconcile by typed
identity. Only exact, complete expressions are accepted.

Compare the requirement with the player's private owned plus built count when a
player is present. A guest sees the condition without a guessed result. Compose
the resulting met, blocked or private-input-unknown state with quest, node,
Mastery Rank and Railjack Intrinsics access evidence. Keep the source fact and
inventory entry independent.

## Consequences

- Node pages and acquisition recommendations explain the required and owned
  quantities with citations.
- Item pages link back to every node for which the item is an access cost.
- The initial allow-list covers Animo Nav Beacons and Judgement Points, producing
  four current live node gates. Locator, key and mixed active-adversary
  conditions remain absent rather than partially modeled.
- Inventory changes alter derived access immediately without rewriting the
  catalog or persisting a redundant access status.
