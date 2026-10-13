# Discovery atlas

The discovery atlas is intended to answer “what systems have I not even heard
of?” without creating a second encyclopedia detached from acquisition and player
progress. Quests, mechanics, secrets, enemies and bosses are canonical entity
kinds, so future prerequisites and node links can join the same identities used
by inventory, builds and drops.

The public `/discovery` route currently searches and filters those entity kinds.
WFCD item data provides quest and enemy identities and descriptions. Empty
mechanic, secret or boss-specific sections are shown honestly rather than being
filled with unattributed prose.

## Current gaps

- Quest prerequisites, unlocks and completion tracking are not modeled.
- WFCD classifies its broad enemy collection as enemies; a separate attributed
  fact is needed before promoting particular entries to boss.
- Mechanics and secrets need a cited manual-data format or another source.
- Discovery relations to nodes, rewards and other topics are not implemented,
  so atlas entries currently rely on the generic catalog detail page.
