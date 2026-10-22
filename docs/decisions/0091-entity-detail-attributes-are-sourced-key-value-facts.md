# 0091: Entity detail attributes are sourced key/value facts

## Context

Canonical fields cover identity and cross-feature rules, but the Codex also
needs descriptive facts such as a Warframe's health, armor, sprint speed and
passive. Adding every display fact as a nullable column would couple the schema
to one provider and make new domains require migrations. Unattributed prose on
the page would undermine the provenance model.

## Decision

Represent non-behavioral detail as versioned `entity-attribute` observations
with a stable key, display label, value and normal evidence. Promotion stores
them by source run. Reads select one deterministic active winner per key using
source priority, retrieval time and source ID, and expose its citation beside
the value.

The structured Wiki Warframe adapter initially emits health, shield, armor,
energy, sprint speed and passive text, and contributes the source description.
Attributes remain display facts: code must not parse them to enforce build,
combat or progression rules. A fact that drives behavior still needs an
explicit typed model.

## Consequences

- Entity pages can become richer without provider-shaped schema growth.
- Conflicting sources remain auditable and deterministic.
- Values are intentionally strings and cannot support numeric simulation.
- Weapons, enemies and other kinds still need reviewed adapters before their
  richer facts appear.
