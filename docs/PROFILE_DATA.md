# Profile data

Player state is stored separately from catalog facts. Inventory rows refer to
canonical entity IDs inside one installation, while exported profiles use
provider identifiers so they can be restored into another installation whose
canonical UUIDs differ.

## Version 12 export

The player section carries the optional Mastery Rank used to evaluate sourced
star-chart gates. Legendary players record rank 30 because all current numeric
Mastery Rank gates are satisfied at that point.

Each inventory entry includes:

- all known external identifiers, ordered with WFCD item IDs first;
- kind, slug, and display name as a fallback and for human inspection;
- owned, built, and wanted counts;
- optional mastered, subsumed, and note values.

Goals use the same portable entity reference and include their desired final
quantity.
Recipe preferences carry a portable output reference plus the selected source
ID and stable recipe record key. Import accepts the preference only when that
exact active recipe is available in the destination catalog; otherwise it is
reported unresolved and the planner uses its deterministic fallback.

Discovery progress uses the same reference and records either `discovered` or
`completed`; unseen topics are represented by absence. Every entity-keyed
section is validated and resolved before the transactional write begins.

Static todos, including structured calendar recurrence rules, and world-state watch
rules are portable as user-authored intent. Their optional catalog links use
the same portable entity reference. If a todo or watch link cannot resolve
during import, the player-authored rule is retained without the link and the
unresolved reference is reported. Recurring occurrence chains
use array-index predecessor references so completed history and an existing next
occurrence cannot generate duplicates after restoration. Generated notifications are
not portable. Private build drafts include their details,
equipment, configurations, positioned mods, and typed arcane/shard enhancement
slots. Shards also carry their selected stable effect key; import requires that
effect to be active for the resolved shard, otherwise the whole build is
reported unresolved. Every catalog member uses the same portable reference. Published share snapshots are intentionally
excluded because they are server-hosted immutable artifacts and capability URLs.

Imports resolve external identifiers first and only fall back to the kind/slug
pair when no identifier is present in the destination catalog. Ambiguous or
missing entries are reported rather than guessed. Merge mode is the default;
replace mode explicitly clears portable state, including player progression
settings, inside the same transaction that writes resolved entries.

The parser treats profile files as untrusted input and rejects invalid counts,
flags, identifiers, and oversized notes before changing player state. Earlier
schemas were replaced rather than migrated as portable state expanded; there is
no pre-release backwards-compatibility requirement.

Signed-in players can export from the inventory screen or import in merge or
replace mode. The HTTP import boundary limits files to 5 MB. Replace mode clears
all portable state—progression settings, inventory, goals, discovery progress,
todos, watches and private build drafts—and writes all resolvable entries in one transaction.
Deleting watches also deletes their derived notifications. Merge mode upserts
identity-keyed state and appends todos, watches and builds. Unresolved build
members skip that whole build; unresolved entries are reported and never guessed.
