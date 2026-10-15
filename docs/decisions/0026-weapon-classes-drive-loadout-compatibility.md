# ADR 0026: Let weapon classes drive loadout compatibility

## Decision

Canonical weapon entities retain one optional, provenance-bearing
`weaponClass`: `primary`, `secondary`, `melee`, `bow`, `shotgun`, `kitgun`,
`zaw`, `archgun`, `archmelee`, `companion`, or `amp`. The WFCD adapter maps its
category, type and product-category fields into this vocabulary. Archwings use
their own canonical entity kind rather than pretending to be weapons.

Equipment search and assignment require a class admitted by the requested
slot. When a build contains both a specialized Bow, Shotgun, Kitgun, or Zaw
arcane and its weapon, each mutation validates the pair. This makes assignment
order irrelevant while preserving partial builds: either side can exist alone.
Candidate arcane searches narrow to the equipped weapon when one is present.

WFCD represents modular weapons as parts. At the adapter boundary, a Kitgun
chamber and Zaw strike are treated as the representative weapon identities;
grips, loaders, links and handles remain components. The build's existing
configuration label can distinguish an assembled variant until structured
modular-part builds are implemented.

## Rationale

The broad `weapon` kind cannot distinguish a rifle from an Amp or prevent a
Secondary weapon being assigned to a Primary slot. The same normalized fact
solves equipment-slot filtering and completes specialized arcane validation.
Keeping provenance on the canonical field permits cited corrections without
coupling build code to WFCD labels.

Treating only chambers and strikes as modular weapon representatives avoids
offering every loader or grip as a complete weapon while still making Kitgun
and Zaw builds expressible in the current partial-loadout model.

## Consequences

- Existing catalogs need a fresh WFCD item import after migration before
  weapons can be newly assigned or cloned.
- A pre-release catalog created with older adapter taxonomy should be rebuilt:
  some Zaw parts change from weapons to components, and Archwings change from
  unknown entities to their own kind. No compatibility migration is provided.
- Modular part statistics and combinations remain a documented gap; chamber or
  strike identity plus a free-form configuration is not a stat calculator.
