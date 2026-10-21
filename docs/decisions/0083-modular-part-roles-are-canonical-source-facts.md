# ADR 0083: Modular part roles are canonical source facts

## Context

Kitguns and Zaws are assembled from role-specific parts, but the catalog
previously represented only chambers and strikes as weapon representatives and
treated every other part as an undifferentiated component. Build composition
cannot validate a loader, grip or link without a source-owned role. Inferring
roles from display names would be brittle, while WFCD identifies the family and
encodes stable part categories in each item's internal path.

## Decision

Add a cited `modularPartRole` canonical entity field with six values:
`kitgun-chamber`, `kitgun-grip`, `kitgun-loader`, `zaw-strike`, `zaw-grip` and
`zaw-link`. WFCD `Kitgun Component` and `Zaw Component` observations map their
`Barrel`, `Handle`, `Clip`, `Tip` and `Balance` path segments to those roles.
An unknown path for either declared provider type rejects the refresh rather
than silently publishing an unclassified modular part.

Chambers and strikes remain weapon entities because they are the existing
build-compatible representatives; the remaining roles remain component
entities. Promotion accepts the role only on weapon or component identities,
retains field provenance, and supports cited manual correction through the
same overlay format.

Early catalog runs classified every Zaw part as a weapon. When the same stable
WFCD external identifier is observed as a component with a non-representative
grip or link role, promotion repairs that entity in place. This exception does
not apply to name-only matching, chambers, strikes, arbitrary weapon/component
changes or observations without the typed role.

## Consequences

- Catalog pages can explain a modular part's family and role with the same
  evidence model as weapon class and maximum rank.
- A later build-composition table can validate exactly one part per required
  role without reparsing provider identifiers.
- Role does not yet assert compatibility between particular parts, a finished
  weapon's statistics, gilding state or ownership of an assembled combination.
- Provider schema drift becomes a failed refresh with the previous active run
  preserved.
- Existing private references keep their entity ID across the bounded legacy
  kind repair; a draft that incorrectly equipped a former grip as a weapon can
  consequently become invalid rather than being silently reinterpreted.
