# 0078: One-time grants compose with inventory

Status: accepted

## Context

Junction rewards are public one-time grant facts, while ownership is private
player state. Players still need to answer whether a Junction grants something
missing from their collection. Reusing the drop count would make that answer
look repeatable, while deriving ownership from objective or node completion
would claim that an in-game reward was collected without account evidence.

Some source rewards intentionally have no canonical entity link. Their labels
remain useful, but the application cannot compare them with an inventory row.

## Decision

Join canonically linked one-time grants to private inventory only in signed-in
read models. Use the existing ownership rule: a linked entity is needed when no
owned or built copy is recorded, or when its wanted count is positive. Keep
one-time total and needed counts separate from repeatable drop counts.

The star chart's unowned-reward filter matches a node when either its repeatable
drop count or its one-time grant count is needed. Node pages show the inventory
state beside each linked grant. Label-only grants do not fabricate an inventory
state and therefore cannot satisfy that filter by themselves.

Do not mutate inventory when an objective or Junction is marked complete. The
application has no authoritative evidence that the reward was claimed, spent,
sold or otherwise remains owned.

## Consequences

- Inventory is composed once and presented consistently for drops and grants,
  while their acquisition semantics stay visibly distinct.
- A player can discover a useful Junction from collection gaps without the
  planner assigning it a repeatable chance or expected run count.
- Completion and ownership may disagree by design until explicit account import
  or reward-claim tracking has its own evidence model.
- Unlinked reward labels remain visible but cannot produce an ownership claim.
