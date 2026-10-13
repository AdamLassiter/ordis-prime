# Discovery atlas

The discovery atlas is intended to answer “what systems have I not even heard
of?” without creating a second encyclopedia detached from acquisition and player
progress. Quests, mechanics, secrets, enemies and bosses are canonical entity
kinds, so future prerequisites and node links can join the same identities used
by inventory, builds and drops.

The public `/discovery` route searches and filters those entity kinds. WFCD item
data provides quest and enemy identities and descriptions. A cited manual YAML
source can add curated topics and typed `requires`, `unlocks`, `occurs-at`,
`involves` and `rewards` links. Both ends resolve through external identifiers;
relationships are source-run scoped and disappear from reads when that source
is superseded. Catalog pages show incoming and outgoing links with attribution.

## Current gaps

- Player discovery and quest completion tracking are not modeled.
- WFCD classifies its broad enemy collection as enemies; a separate attributed
  fact is needed before promoting particular entries to boss.
- Conditional requirements, ordered quest steps, and relation confidence are
  not modeled.
- The atlas cards do not yet summarize their graph neighbors; relationships are
  visible on the generic catalog detail page.
