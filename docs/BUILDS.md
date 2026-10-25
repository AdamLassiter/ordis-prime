# Builds and sharing

Builds are private, revisioned drafts composed from canonical catalog entities.
They may contain any subset of the supported loadout. The editor and immutable
share route use the same focused in-game-style presentation: a ten-card rail selects
Warframe, Primary, Secondary, Melee, Companion, Companion Weapon, Archwing,
Archgun, Archwing Melee, or a combined Operator/Amp panel. The selected item
alone supplies the stats, configuration and applicable arcanes; build metadata,
acquisition and publishing remain outside the rail.

Equipment is treated as max rank. Mods start at their sourced maximum rank but
may be stepped down, while arcanes retain an optional selected rank. Each item
can also store notes, a configuration label, Forma count, modular parts, and an
Orokin Reactor or Catalyst where applicable. The Operator panel combines a
maxed Focus-school selection with the Amp and two Operator plus two Amp arcanes.
Individual Focus Ways are intentionally represented by freeform build notes.

## Mod grid and capacity

Slot geometry is defined by equipment family rather than freeform positions:

- Warframes have eight normal slots plus Aura and Exilus. A second Aura slot is
  exposed when cited factory facts or existing configuration require it.
- Primary and Secondary weapons have eight normal slots plus Exilus.
- Melee weapons have eight normal slots plus Stance and Exilus.
- Companions have ten normal slots.
- Companion weapons, Archwings, Archguns and Archwing Melee have eight normal
  slots. Amps do not use this capacity model.

Normal slots render odd positions across the first row and even positions
across the second. Aura, Stance and Exilus occupy a top row beside a sourced
passive. Empty slots remain visible. Each slot independently preserves its
polarity, and each installed mod shows its polarity, selected rank, raw drain
and polarity-adjusted drain or capacity grant.

Matching ordinary polarity uses `ceil(drain / 2)` and a mismatch uses
`ceil(drain * 1.25)`. Matching Aura or Stance polarity doubles the grant; a
mismatch uses `floor(grant * 0.8)`. Reactors and Catalysts double max-rank base
capacity before Aura or Stance grants. Unknown source facts remain visibly
unknown rather than being estimated. Cited factory-polarity role/count sets are
shown as guidance because their sources do not assert exact positions.

## Abilities, enhancements and stats

Warframe panels expose active sourced base stats, passive, ordered abilities,
and five Archon Shard slots. One Helminth replacement may be stored. Its
original ability must belong to the equipped Warframe and its replacement must
have an active sourced eligibility fact. Changing or removing the Warframe
clears the replacement. The donor Warframe participates in acquisition planning
unless the player already records it as subsumed.

Warframes have two arcane slots; Primary, Secondary and Melee have one each.
Arcane assignment enforces sourced broad and specialized weapon classes.
Archon Shards require a cited effect option and retain their historical label
if a later source removes that option. Structured base stats are embedded into
shares, but mod effects are not yet applied to derive modified stats.

## Share and portability semantics

Sharing creates an immutable, unlisted snapshot with a random 144-bit key. The
snapshot embeds displayed names, stats, abilities, Focus/Helminth selections,
configuration and enhancements at that revision, so later draft or catalog
changes cannot rewrite what a recipient saw. New publications create new URLs;
individual snapshots may be revoked. Deleting the source draft does not delete
its snapshots.

Authenticated recipients can resolve an immutable snapshot into a private
clone. Focus schools, Helminth replacements, modular parts, slots, mods and
enhancements also survive private cloning and portable profile export/import.
Published capability URLs are installation-local and are not included in the
portable profile.

An explicitly confirmed AlecaFrame preview may create a new private draft from
the snapshot's current NORMAL and SENTINEL presets. Equipment, the active config,
verified mod positions and ranks, supported final polarities, Forma counts and
compatible Arcanes are copied through the normal build validators. Existing
drafts are never updated. Unknown Catalyst/Reactor and adapter state defaults to
off with an import note; uncertain companion mod placement and other preset
families are reported instead of guessed.

## Current compromises

- Weapon base-stat coverage remains incomplete. Missing structured values are
  shown as unavailable rather than parsed from prose.
- Mod effects and modular-weapon combination statistics are not yet calculated.
- Helminth validation uses explicit subsumable eligibility but does not yet
  encode every category or Warframe-specific incompatibility.
- Focus Ways, ranks and Way-Bound progression are outside the build schema.
- Search is submit-driven and contextual rather than autocomplete or drag/drop.
