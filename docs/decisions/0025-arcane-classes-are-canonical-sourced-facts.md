# ADR 0025: Make arcane classes canonical sourced facts

## Decision

Canonical arcane entities retain one optional, provenance-bearing
`arcaneClass`: `warframe`, `operator`, `amp`, `primary`, `secondary`, `melee`,
`kitgun`, `zaw`, `bow`, or `shotgun`. The WFCD adapter translates its current
type labels into this vocabulary at the provider boundary. Cited factual
overlays can supply or correct the same field.

Build candidate searches show only classes admitted by the requested slot, and
assignment validates the class again inside the database operation. An
unclassified arcane is not assumed compatible. Specialized weapon arcanes are
admitted to their possible broad slots: Bow and Shotgun to Primary, Kitgun to
Primary or Secondary, and Zaw to Melee.

## Rationale

The broad `arcane` entity kind is useful for discovery but insufficient to
prevent impossible loadouts. Persisting the normalized class with ordinary
field provenance makes the rule inspectable and lets higher-priority cited
sources correct upstream classification without leaking WFCD strings into the
build model.

Both search filtering and write-time validation are necessary. Search provides
a useful editor, while the mutation remains authoritative for imported profiles
and direct server calls.

## Consequences

- Existing catalogs need a fresh WFCD item import after migration before their
  arcanes can be newly assigned or cloned.
- The catalog detail page exposes the chosen class and its regular field
  evidence.
- This does not prove that a specialized arcane matches the equipped weapon.
  That needs separately sourced canonical weapon-class facts; until then the
  build only guarantees broad slot compatibility.
