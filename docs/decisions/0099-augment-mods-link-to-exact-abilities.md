# 0099: Augment mods link to exact abilities

Status: accepted

## Context

Warframe ownership connects a frame to its powers but does not say which mod
augments which ability. Shared names and prose inference are too ambiguous for
build and discovery links.

## Decision

Parse each current ability's structured augment table together with the Wiki
mod module. Emit the mod description and a cited `augments` relation from the
mod to the exact ability. Keep the relation distinct from the broader
Warframe-to-ability `involves` relationship.

## Consequences

Catalog pages can navigate directly between Chaos Sphere and Chaos and show the
Wiki descriptions for both. Missing or changed module structure fails at the
adapter boundary instead of being guessed from prose.
