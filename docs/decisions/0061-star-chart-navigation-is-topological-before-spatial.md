# 0061: Star-chart navigation is topological before spatial

Status: accepted

## Context

ADR 0060 supplies a cited connection graph, but no active source supplies the
stable visual coordinates needed to reproduce the in-game star chart. A force
layout or arbitrary coordinates would look authoritative while moving between
requests and would confuse topology with geography.

Players still need to answer which nodes directly connect, move through that
graph, and open a connected node's rewards without repeatedly returning to a
flat planet list.

## Decision

Add a server-rendered connection explorer to `/star-chart`. A `focus=` query
selects one canonical node and presents its directly connected canonical nodes.
Each neighbor can become the next focus, and both the focused node and every
planet card retain direct links to node details and rewards.

Treat this as topological navigation, not a visual map. Use the cited undirected
edges as the only adjacency input, keep focus shareable in the URL, and label
the absence of in-game coordinates explicitly. Do not persist focus as player
state or synthesize positions.

## Consequences

- Players can traverse the imported star-chart graph and inspect reward-bearing
  nodes without an unattributed layout.
- A focused URL is deterministic and shareable, and requires no client-only
  graph library or duplicated map model.
- Search and inventory-needed filters remain controls for the grouped index;
  graph focus is independent so filtering cannot hide its neighbors.
- A future attributed coordinate source can add a spatial rendering over the
  same canonical nodes and edges without replacing this navigation model.
