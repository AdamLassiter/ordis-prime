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

The public `/star-chart` view groups nodes by planet and filters by node, mission
or faction text. Signed-in players can restrict it to nodes with at least one
reward their inventory marks as unowned or still wanted. Node detail pages show
the same metadata beside their full reward lists.

## Current compromise

Neither imported WFCD dataset contains navigation edges or stable visual
coordinates. The current chart is therefore a planet-grouped spatial index, not
a claim to reproduce the in-game map. Connection prerequisites and positions
need another attributed source or curated manual dataset before an interactive
graph is honest.

Quest prerequisites, mechanics and secrets do not yet have typed relations to
nodes. Enemy and quest identities are imported, but their domain-specific facts
and discovery links remain future work.
