# Profile data

Player state is stored separately from catalog facts. Inventory rows refer to
canonical entity IDs inside one installation, while exported profiles use
provider identifiers so they can be restored into another installation whose
canonical UUIDs differ.

## Version 1 export

Each inventory entry includes:

- all known external identifiers, ordered with WFCD item IDs first;
- kind, slug, and display name as a fallback and for human inspection;
- owned, built, and wanted counts;
- optional mastered, subsumed, and note values.

Imports resolve external identifiers first and only fall back to the kind/slug
pair when no identifier is present in the destination catalog. Ambiguous or
missing entries are reported rather than guessed. Merge mode is the default;
replace mode explicitly clears existing inventory inside the same transaction
that writes resolved entries.

The parser treats profile files as untrusted input and rejects invalid counts,
flags, identifiers, and oversized notes before changing player state. Version 1
may be replaced before stable release; there is no pre-release compatibility
promise.
