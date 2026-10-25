# 0087: Discovery topology is a derived one-hop view

Status: accepted

## Context

Progression already joins quests, abilities, enemies, bosses, mechanics,
secrets, equipment and nodes through canonical typed relations. A spatial view
can make those links easier to explore, but no current source asserts global
coordinates or meaningful distance between these concepts. Persisting layout
positions would create a second graph model and imply semantics the evidence
does not contain.

## Decision

Render a focused one-hop topology directly from the selected entity's active
cited relations. Place the focus at the center and unique direct neighbors on a
deterministic ring sorted by name and identity. Treat coordinates as transient
presentation state.

Encode the focus as `kind:slug` in the Progression query string and preserve current
search, kind and progress filters during traversal. Selecting another discovery
kind refocuses the graph. Selecting a node, equipment item or other non-Progression
entity opens its existing canonical detail route.

Keep a textual direct-link list beside the diagram with relation direction and
source identity. The diagram does not replace accessible navigation or evidence.

## Consequences

Players can follow a chain of discoveries without a separate graph database or
invented coordinates. Multiple sourced relations to one entity share a visual
node but remain separate in the textual list. The view does not yet show a
global or multi-hop layout, and its ring can become visually dense for unusually
connected topics.
