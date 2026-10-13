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

Signed-in players can independently mark a topic unseen, discovered or
completed. The absence of a row means unseen, keeping default state compact.
The atlas can filter by this private state, while guests see the same public
catalog without progress controls. Each atlas card also counts active cited
relationships so connected topics are distinguishable from isolated records
before opening their detail pages.

## Current gaps

- Progress is one state per topic; quest steps and repeat completion are not
  modeled.
- WFCD classifies its broad enemy collection as enemies; a separate attributed
  fact is needed before promoting particular entries to boss.
- Conditional requirements, ordered quest steps, and relation confidence are
  not modeled.
- Atlas cards count but do not preview or visualize their graph neighbors;
  relationship details are visible on the generic catalog detail page.
