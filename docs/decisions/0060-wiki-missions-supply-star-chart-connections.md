# 0060: Wiki missions supply star-chart connections

Status: accepted

## Context

WFCD supplies useful node identities, metadata and drops but not star-chart
adjacency. The official Wiki's versioned
[`Module:Missions/data`](https://wiki.warframe.com/w/Module:Missions/data)
contains a `MissionDetails` table with node metadata and `NextNodes` and
`PreviousNodes` lists. The existing catalog already supports cited,
source-owned `connects-to` relations and exposes them symmetrically.

The module assigns its table to a local Lua variable before returning it. It is
still literal data, but supporting it must not turn the ingestion process into
a Lua execution environment.

## Decision

Add an independent `warframe-wiki-missions` adapter. Fetch the module through
MediaWiki with an exact revision, parse its Lua abstract syntax tree without
executing code, and resolve a returned local literal table as well as a directly
returned table.

Emit one node identity and node-detail observation per named mission. Convert
the union of `NextNodes` and `PreviousNodes` into canonical undirected pairs so
reciprocal declarations do not duplicate an edge. Require every referenced
neighbor to exist in the same candidate and reject duplicate node names,
missing planets, malformed numeric fields, an empty mission set or an empty
connection set. Apply the same 50 percent shrinkage guard as other automatic
catalog sources and schedule it independently once per day.

## Consequences

- Node pages and the star-chart index can answer attributed adjacency questions
  without a manually maintained edge file.
- The adoption-time live import promoted 357 node details and 334 unique
  connections with no resolver conflicts alongside WFCD data.
- Wiki-only hubs and activities become canonical nodes with their own planet
  metadata instead of falling into an unknown group.
- Stable visual coordinates remain absent, so the public chart is still a
  grouped index rather than a rendered in-game map.
- A mission-schema failure affects only this source; the last healthy run stays
  active and other Wiki enrichment continues refreshing independently.
