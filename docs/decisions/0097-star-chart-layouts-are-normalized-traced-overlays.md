# 0097: Star Chart layouts are normalized traced overlays

Status: accepted

## Context

The official chart is spatial, but structured mission data supplies topology
rather than display coordinates. Derived rings are usable but do not reproduce
the game's overview or planet layouts. Storing screenshots would add copyrighted
assets and couple geometry to one resolution.

## Decision

Open Navigation on a zoomed-out planet summary and use `planet=` to enter one
planet. Store optional layout annotations as schema-versioned normalized JSON,
separate from catalog facts. A browser-only tool traces planet circles, arc
control points, mission nodes and junctions over a local screenshot. The
renderer uses annotations where present and deterministic fallbacks elsewhere.
Only cited catalog relations create routes.

## Consequences

The chart can converge on source-faithful geometry incrementally without
claiming that fallback positions are factual. Screenshot pixels never need to
be uploaded or committed. A human still has to trace and review the complete
layout.
