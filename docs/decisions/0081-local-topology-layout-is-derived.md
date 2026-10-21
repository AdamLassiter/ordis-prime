# ADR 0081: Local topology layout is derived

## Context

The structured Wiki mission source supplies attributed node identities and
connection edges, but neither it nor the current WFCD feeds supplies stable
visual coordinates. A list of neighbors answers the graph question but makes
the relationship harder to scan than a map. Treating an arbitrary layout as
the in-game Star Chart would overstate the source evidence.

## Decision

Render a deterministic one-hop topology map for the focused node. Place the
focus at the center and its directly connected canonical neighbors, sorted by
name, around an ellipse. Every node in the SVG is an in-app link that changes
the focus. Only active cited `connects-to` relations determine membership; the
coordinates are presentation state and are neither persisted nor promoted into
the catalog.

The accompanying text continues to identify this as a connection explorer, not
as a reproduction of the in-game map. A missing referenced canonical node is
omitted defensively at read time, while source promotion remains responsible
for rejecting broken mission graphs.

## Consequences

- Players can scan and traverse the local graph without a second node model or
  a client-side graph dependency.
- The layout is stable for the same set of neighbor names and works in the
  server-rendered application.
- Adding or renaming a neighbor can reposition the local ring; positions carry
  no domain meaning.
- A global spatial Star Chart still requires an attributed coordinate source
  or a separately documented derived-layout design.
