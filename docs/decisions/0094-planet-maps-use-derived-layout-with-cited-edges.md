# 0094: Planet maps use derived layout with cited edges

## Context

The Wiki mission source supplies stable nodes, planets and navigation edges but
not the visual coordinates used by the game. A text-only planet grouping hides
the graph shape, while guessed coordinates could be mistaken for source truth.

## Decision

Render a deterministic per-planet SVG with the planet at its centre and mission
nodes distributed around it. Draw only active cited within-planet edges. Apply
private task and inventory markers plus current normalized world-state markers
to the same canonical node IDs. Keep the detailed list as the accessible and
information-rich companion view.

The geometry is presentation state and is never persisted or attributed to the
Wiki. Cross-planet topology and exact in-game coordinates remain outside this
view until an attributable source is available.

## Consequences

- The Star Chart communicates planets and connected locations at a glance.
- Search and player filters affect both map and list consistently.
- Layout stability comes from canonical IDs, not source coordinate claims.
- The result resembles the game's navigation model without claiming pixel or
  coordinate fidelity.
