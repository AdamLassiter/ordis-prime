# Builds and sharing

Builds are private player-owned drafts composed from canonical catalog entities.
They can be partial: a player may record only a Warframe, one weapon, or any
subset of the supported loadout slots. Each equipment entry can carry notes and
up to twenty positioned mods with optional ranks. It can also record a freeform
configuration label (for example, an Incarnon or named config), Forma count, and
whether an Orokin capacity upgrade is installed.
Build-level enhancement slots record Warframe, operator/amp and weapon arcanes
plus five positioned Archon Shards. Arcanes can retain an optional rank. Every
new shard assignment chooses one active, cited effect option; the build stores
the stable option key and the label shown at selection time. If a later source
version removes that option, the draft keeps its historical choice and marks it
unavailable rather than silently substituting another effect.

Changing an equipment item clears that slot's mods and configuration because
those assignments are usually item-specific. Every edit increments the build revision. Slot validation
currently requires Warframe, companion and weapon entity kinds as appropriate;
mod positions require canonical mod entities, and enhancement slots require
canonical arcane or shard entities. Arcane search and assignment also require
an active, sourced class compatible with the broad slot family: Warframe,
Operator, Amp, Primary, Secondary or Melee. Specialized Bow, Shotgun, Kitgun
and Zaw arcanes are admitted only to their possible weapon-family slots.

## Share semantics

Sharing creates an immutable, unlisted snapshot with a random 144-bit key. The
snapshot embeds names, kinds and slugs at that revision, so later draft edits or
catalog changes cannot rewrite what a recipient saw. Deleting a source build
does not delete its snapshots. A new share action creates a new URL rather than
mutating an old one.

This is intentional: an editable public build would make discussion links and
cited recommendations unstable. Authentication is required to edit a draft but
not to view a snapshot.

The authenticated `/builds` workshop creates drafts. Its editor searches the
canonical catalog with slot-specific kind filtering, assigns equipment, mods and
enhancements,
records build and per-slot notes, and publishes snapshots. Public snapshot routes
render without authentication and link embedded entities back into the catalog.
The draft page lists every snapshot it published, can revoke an individual
capability URL, and can clone the current private draft with its equipment,
configuration and mods intact. An authenticated recipient can also clone a
public snapshot into a new private draft. The immutable source snapshot is not
changed and the clone resolves every embedded kind/slug against the recipient
installation's active catalog in one transaction.

The editor can project a draft into acquisition goals. It counts repeated mod
requirements (including repeated shard slots), ignores requirements already covered by owned or built inventory,
and never reduces a larger existing goal. The regular planner then expands
recipes and recommends nodes using the same canonical IDs.

## Current limits

- Forma count, a capacity-upgrade flag, and a configuration label are recorded,
  but polarities and calculated capacity/drain are not modeled. Broad arcane
  class compatibility is enforced from cited canonical facts. Specialized Bow,
  Shotgun, Kitgun and Zaw arcanes are not yet checked against the equipped
  weapon subtype because canonical weapon-class facts are still absent.
  Abilities, schools and structured weapon configuration variants are also
  absent.
- Private build drafts are included in portable profile export/import. Published
  share snapshots are deliberately installation-local capability URLs.
- Share keys are unlisted capabilities, not access-controlled invitations.
  Revocation deletes that immutable snapshot; anyone with the URL then receives
  a not-found response.
- Search is submit-driven rather than an autocomplete.
