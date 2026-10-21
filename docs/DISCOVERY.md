# Discovery atlas

The discovery atlas is intended to answer “what systems have I not even heard
of?” without creating a second encyclopedia detached from acquisition and
player progress. Quests, abilities, mechanics, secrets, enemies and bosses are
canonical entity kinds, so future prerequisites and node links can join the
same identities used by inventory, builds and drops.

The public `/discovery` route searches and filters those entity kinds. WFCD item
data provides quest and enemy identities and descriptions. A cited manual YAML
source can add curated topics and typed `requires`, `unlocks`, `occurs-at`,
`involves`, `rewards`, `follows` and node `connects-to` links. Both ends resolve through external identifiers;
relationships are source-run scoped and disappear from reads when that source
is superseded. Catalog pages show incoming and outgoing links with attribution.
The structured Wiki ability adapter adds current abilities and their in-game
descriptions, then links each ability to a typed Warframe or Archwing identity
validated against the paired Wiki powersuit module. Archived abilities stay
out of the current atlas. Abilities owned by unsupported equipment families
remain searchable but deliberately unlinked rather than inventing a kind.
The Wiki quest adapter adds current main and optional quests with their in-game
descriptions. Its `PreviousQuest` field becomes a sequence-only `follows` link;
it does not masquerade as an access prerequisite.
The structured mission adapter promotes its explicit `Boss` field into a boss
identity and a cited `occurs-at` link to the canonical mission node. A matching
WFCD enemy identity is refined in place rather than duplicated; boss is the more
specific classification and a later broad enemy observation cannot downgrade
it. Node pages list these incoming discoveries, while boss pages link back to
the node using the in-app node route.
The structured enemy adapter broadens classification to every record explicitly
typed as a boss across the Wiki's faction partitions. It intentionally does not
turn the modules' mixed planet and mission labels into node links, so bosses
outside ordinary Assassination nodes can be discoverable without acquiring a
false location.

Signed-in players can independently mark a topic unseen, discovered or
completed. The absence of a row means unseen, keeping default state compact.
The atlas can filter by this private state, while guests see the same public
catalog without progress controls. Each atlas card counts active cited
relationships and previews up to three neighbors with the relationship, source,
and in-app destination. The canonical entry remains the place to inspect every
relationship and its evidence.

## Current gaps

- Progress is one state per topic; quest steps and repeat completion are not
  modeled.
- The broader enemy adapter is implemented and scheduled, but its first live
  promotion still depends on the Wiki API returning from its current
  maintenance outage. Mission-derived bosses remain the active baseline until
  that succeeds.
- Boss planet and mission labels are not yet normalized into typed regions,
  modes and canonical nodes.
- Conditional requirements, ordered quest steps, and relation confidence are
  not modeled.
- Atlas cards do not spatially visualize their graph neighbors.
