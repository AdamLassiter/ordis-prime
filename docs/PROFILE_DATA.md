# Profile data

Player state is stored separately from catalog facts. Inventory rows refer to
canonical entity IDs inside one installation, while exported profiles use
provider identifiers so they can be restored into another installation whose
canonical UUIDs differ.

## Version 21 export

The player section carries an optional combined Mastery Rank used to evaluate
sourced star-chart gates and build capacity. Values 0 through 30 are ordinary
Mastery Ranks; 31 represents Legendary Rank 1, 32 represents Legendary Rank 2,
and so on through the current forward-compatible input ceiling of 40. It also
carries an optional highest Railjack Intrinsic category rank from 0 through 10,
used only for sourced Railjack access gates.
The player section also carries an optional active adversary value: explicit
none, Kuva Lich, Sister of Parvos or Technocyte Coda. Absence means the player
has not recorded this state, not that no adversary is active.
An optional highest currently available Warframe rank from 0 through 30 is used
for equipment-rank node gates. It is deliberately independent of mastered
history and build drafts.

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

Node progress is separate from discovery progress. Each row identifies a
canonical node through the same portable reference and records its ISO
completion time; absent nodes are incomplete.

Junction objective progress is separate from whole-node completion. Each
completed objective carries the portable node reference, source ID,
content-derived objective key, a human-readable label snapshot and completion
time. Import accepts it only when that exact objective is active on the resolved
node; changed or withdrawn tasks are reported unresolved rather than attached
by row position. Stale local completions remain recoverable but do not satisfy
the current access rule.

Static todos, including structured calendar recurrence rules, and world-state watch
rules are portable as user-authored intent. Their optional catalog links use
the same portable entity reference. If a todo or watch link cannot resolve
during import, the player-authored rule is retained without the link and the
unresolved reference is reported. Recurring occurrence chains
use array-index predecessor references so completed history and an existing next
occurrence cannot generate duplicates after restoration. Generated notifications are
not portable. The portable watch kind includes static reward rotations; their
generated occurrences remain derived from the destination installation's
current cited schedule rather than being embedded in the profile. Private build drafts include their details,
equipment, configurations, current equipment ranks, positioned mods, mod-slot
roles and polarities independently of installed mods, selected modular Kitgun
or Zaw components, plus typed arcane/shard
enhancement slots. Shards also carry their selected stable effect
key; import requires that effect to be active for the resolved shard, otherwise the whole build is
reported unresolved. Every catalog member uses the same portable reference. Published share snapshots are intentionally
excluded because they are server-hosted immutable artifacts and capability URLs.

AlecaFrame snapshot import is a separate account-local ingestion path rather
than another portable profile format. Its applied inventory, progression and
optional new build draft become ordinary profile state and therefore appear in
later exports, but the encrypted source, decrypted document, preview hash and
unresolved records are not retained.

Imports resolve external identifiers first and only fall back to the kind/slug
pair when no identifier is present in the destination catalog. Ambiguous or
missing entries are reported rather than guessed. Merge mode is the default;
replace mode explicitly clears portable state, including player progression
settings and objective progress, inside the same transaction that writes
resolved entries.

The parser treats profile files as untrusted input and rejects invalid counts,
flags, identifiers, and oversized notes before changing player state. Earlier
schemas were replaced rather than migrated as portable state expanded; there is
no pre-release backwards-compatibility requirement.

Signed-in players can export from the inventory screen or import in merge or
replace mode. The HTTP import boundary limits files to 5 MB. Replace mode clears
all portable state—progression settings, inventory, goals, discovery progress,
node completion, objective completion, todos, watches and private build
drafts—and writes all
resolvable entries in one transaction.
Deleting watches also deletes their derived notifications. Merge mode upserts
identity-keyed state and appends todos, watches and builds. Unresolved build
members skip that whole build; unresolved entries are reported and never guessed.

## Raw game-inventory merge

The inventory screen also accepts a raw JSON inventory response obtained by the
player from their own Warframe session. This is not the portable profile
format. The upload is limited to 10 MB, parsed in memory and never retained.
Only allow-listed owned-item arrays and Helminth `ConsumedSuits` are read;
account identifiers, session credentials and unrelated response fields are
ignored.

`ItemType` values resolve only through exact active WFCD `uniqueName`
identifiers. Confirmed quantities monotonically raise existing owned counts and
confirmed consumed suits set the subsumed flag. The merge never lowers a
manual count or infers mastery, so an old snapshot cannot erase player-authored
state. Unresolved paths are counted rather than matched by display name.
Consequently this is a convenient evidence merge, not yet an authoritative
two-way account synchronization mechanism.

The accepted file is the inventory object itself, not a network archive,
launcher log, portable Ordis Prime profile, or credentials. Players may obtain
that response through an exporter they already trust, save its response body as
JSON, and upload it locally. Ordis Prime deliberately does not implement a
Warframe account-login proxy: the application never needs an account password,
two-factor code, or session token. The inventory screen lists the supported
top-level arrays and shows a minimal example before upload.
