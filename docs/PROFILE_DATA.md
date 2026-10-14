# Profile data

Player state is stored separately from catalog facts. Inventory rows refer to
canonical entity IDs inside one installation, while exported profiles use
provider identifiers so they can be restored into another installation whose
canonical UUIDs differ.

## Version 5 export

Each inventory entry includes:

- all known external identifiers, ordered with WFCD item IDs first;
- kind, slug, and display name as a fallback and for human inspection;
- owned, built, and wanted counts;
- optional mastered, subsumed, and note values.

Goals use the same portable entity reference and include their desired final
quantity.

Discovery progress uses the same reference and records either `discovered` or
`completed`; unseen topics are represented by absence. Every entity-keyed
section is validated and resolved before the transactional write begins.

Static todos and world-state watch rules are portable as user-authored intent;
a todo's optional catalog link uses the same portable entity reference. If that
link cannot resolve during import, the player-authored task is retained without
the link and the unresolved reference is reported. Generated notifications are
not portable. Private build drafts include their details,
equipment, configurations and positioned mods, with every catalog member using
the same portable reference. Published share snapshots are intentionally
excluded because they are server-hosted immutable artifacts and capability URLs.

Imports resolve external identifiers first and only fall back to the kind/slug
pair when no identifier is present in the destination catalog. Ambiguous or
missing entries are reported rather than guessed. Merge mode is the default;
replace mode explicitly clears portable state inside the same transaction that
writes resolved entries.

The parser treats profile files as untrusted input and rejects invalid counts,
flags, identifiers, and oversized notes before changing player state. Earlier
schemas were replaced rather than migrated as portable state expanded; there is
no pre-release backwards-compatibility requirement.

Signed-in players can export from the inventory screen or import in merge or
replace mode. The HTTP import boundary limits files to 5 MB. Replace mode clears
all portable state—inventory, goals, discovery progress, todos, watches and
private build drafts—and writes all resolvable entries in one transaction.
Deleting watches also deletes their derived notifications. Merge mode upserts
identity-keyed state and appends todos, watches and builds. Unresolved build
members skip that whole build; unresolved entries are reported and never guessed.
