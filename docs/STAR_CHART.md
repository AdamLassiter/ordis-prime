# Star chart and node metadata

Mission nodes are canonical entities shared by drop tables, acquisition plans,
inventory overlays and spatial navigation. Node metadata is represented as a
typed observation rather than being parsed back out of descriptions.

The WFCD item adapter supplies internal node identity, planet, enemy-level range,
mastery requirement and numeric node type. The drop-data adapter independently
supplies planet and human-readable mission type. Active observations are merged
field by field in source-priority order, so one source can fill a missing field
without replacing another source's complete record. Exact source run, record key
and payload path remain attached to every metadata row.

The structured Wiki mission adapter independently supplies the current
`MissionDetails` node set, planet, mission type, faction, enemy-level range and
the `NextNodes`/`PreviousNodes` graph. It parses the versioned Lua table as data
without executing provider code. Reciprocal declarations collapse to one
undirected `connects-to` observation, while missing referenced nodes reject the
whole candidate instead of publishing a broken graph.

The public `/star-chart` view groups nodes by planet and filters by node, mission
or faction text. Signed-in players can restrict it to nodes with at least one
reward their inventory marks as unowned or still wanted. Node detail pages show
the same metadata beside their full reward lists. Active cited `connects-to`
relations are treated as undirected navigation edges: either endpoint lists the
other, even though a source only needs to state the edge once. A shareable
`focus=` view lets a player traverse those direct connections and move between
topology and a node's rewards without inventing spatial positions.

## Current compromise

No imported source supplies stable visual coordinates. The current chart can
answer node-adjacency questions from the attributed Wiki graph, but remains a
planet-grouped index plus a topological connection explorer rather than a
reproduction of the in-game map. Positions still need another attributed source
before a visual graph is honest.

Enemy and quest identities are imported, but richer domain-specific facts and
complete curated discovery links remain future work.
