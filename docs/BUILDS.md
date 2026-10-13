# Builds and sharing

Builds are private player-owned drafts composed from canonical catalog entities.
They can be partial: a player may record only a Warframe, one weapon, or any
subset of the supported loadout slots. Each equipment entry can carry notes and
up to twenty positioned mods with optional ranks. It can also record a freeform
configuration label (for example, an Incarnon or named config), Forma count, and
whether an Orokin capacity upgrade is installed.

Changing an equipment item clears that slot's mods and configuration because
those assignments are usually item-specific. Every edit increments the build revision. Slot validation
currently requires Warframe, companion and weapon entity kinds as appropriate;
mod positions require canonical mod entities.

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
canonical catalog with slot-specific kind filtering, assigns equipment and mods,
records build and per-slot notes, and publishes snapshots. Public snapshot routes
render without authentication and link embedded entities back into the catalog.

## Current limits

- Forma count, a capacity-upgrade flag, and a configuration label are recorded,
  but polarities and calculated capacity/drain are not modeled. Arcanes, shards,
  abilities, schools and structured weapon configuration variants are also absent.
- Builds are not included in portable profile export and have no import format.
- Share keys are unlisted capabilities, not access-controlled invitations, and
  cannot yet be revoked.
- Search is submit-driven rather than an autocomplete, and there is no build
  cloning or snapshot history UI.
