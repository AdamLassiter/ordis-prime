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

The adapter also snapshots the structured quest-key module and accepts only
allow-listed complete requirement expressions made from quest and node
completion. These become cited `node requires prerequisite` relations. The
quest-plus-node expression for Vehrvod District is fully modeled; expressions
that also require unsupported ranks or items remain unmodeled as a whole, so
the parser does not publish a misleading partial rule.
An exact Mastery Rank-only expression becomes the existing typed numeric node
gate. Complete allow-listed Railjack Intrinsics expressions populate a separate
0–10 gate and retain every supported quest clause; Intrinsics are never coerced
into Mastery Rank. Expressions containing unsupported conditions still fail
closed as a whole.
Exact Kuva Lich, Sister of Parvos and Technocyte Coda confrontation expressions
become typed adversary gates while retaining their complete Intrinsics or quest
clauses.
The exact Elite Sanctuary Onslaught expression retains its quest relation and
adds a numeric level-30 Warframe gate.
The 13 Junction pages independently contribute their four ordered objective
descriptions and hints plus their typed one-time rewards. Task rewards attach to
the corresponding content-derived objective key; final-row rewards attach to
Junction completion. These are cited public facts displayed on the matching
canonical node; they are not inferred from mission requirement prose or treated
as repeatable mission drops.
Exact item-only expressions for Animo Nav Beacons, Judgement Points, Grendel
Locators and the Mutalist Alad V Assassinate Key become cited
node/item/quantity facts. They reconcile to the same canonical resources used
by inventory. Other item and mixed expressions remain absent rather than being
reduced to a misleading subset.

The public `/star-chart` view opens on a zoomed-out Origin System and exposes a
higher navigation tier for the Origin System, Railjack Proximas, and the
Sanctuary / Dark Refractory / Duviri spaces. Höllvania is presented alongside
Origin System planets because its node graph has the same interaction model.
Every location
shows node, live-window, open-task, repeatable-reward and unowned-reward totals.
Selecting a planet changes the shareable `planet=` query state and opens its
mission graph and node list. Active cited `connects-to` relations drive both the
within-planet routes and the interplanetary summary. Node markers can highlight
a current world-state window, an open linked Foundry task, and an unowned
reward.

The chart does not use result filters. A repeatable `show=` query parameter is a
multi-select presentation control for events, tasks, needed rewards, mission
type, enemy level, reward counts, access state and private completion. These
choices change the amount of visible detail without removing planets or nodes
from navigation.

An optional versioned layout file at `data/manual/star-chart-layout.json` can
override planet circles, junction arcs, mission-node positions, node/junction
radii, planet-view junction positions, and presentation-only manual node edges
with normalized screenshot coordinates. The browser-only tool at
`/star-chart/layout` accepts an overview or planet screenshot, loads fixed
planet and node choices from the active catalog, and lets an operator trace and
resize those shapes and points before importing or exporting the JSON. The
screenshot is displayed at its real full-width aspect ratio, never leaves the
browser, and is not stored in the exported file.
Missing annotations fall back independently to deterministic derived geometry,
so a partial trace remains usable.

Connections are treated as undirected navigation edges: either endpoint lists
the other, even though a source only needs to state the edge once. Geometry
never creates a connection; traced and fallback positions only place cited
nodes and edges.
Incoming cited `occurs-at` and `involves` relations are also listed on the node,
so its structured boss and curated discovery topics are reachable in-app rather
than only from the discovery side of the graph.
Node pages list complete structured access requirements with their source and,
when signed in, the player's private discovery or node-completion state for each
prerequisite.
They also compare a sourced Mastery gate with the player's private combined
Mastery/Legendary Rank when one has been recorded.
Railjack nodes similarly compare their sourced Intrinsics gate with the
player's private highest rank in any Railjack Intrinsics category.
Item gates compare the cited quantity with private owned plus built inventory;
the item page links back to nodes that consume it for access.
Adversary gates compare the required kind with the player's private active
adversary. Explicitly recording none or another kind blocks the node; leaving
the setting unrecorded keeps it conditional.
The Warframe-rank gate compares with the player's private highest rank among
currently available Warframes; it is not inferred from mastery history or build
drafts.
The chart derives the same available, conditional, blocked or unknown state for
every node and can display it. It does not persist that state or infer access
from graph connectivity. Guests therefore see private-input-dependent evidence
as conditional rather than available.

Signed-in players can separately record whether each canonical node is complete
and filter the chart by completed or incomplete nodes. Absence of private state
means incomplete. Completion is not used as a synonym for access: clearing a
node does not rewrite sourced prerequisites, and a connection does not mark
either endpoint complete. Completed nodes are part of portable player profiles.
The chart also provides a bulk editor for the selected planet. Its explicit
submitted scope means checked and unchecked nodes on that planet are updated
atomically while nodes on other planets remain untouched.

Junction node pages list the current four sourced objectives in Wiki order with
their hints and revision citations. Signed-in players can mark each current
objective complete. Any incomplete objective blocks Junction access, all four
completed objectives satisfy that part of the rule, and guests see the private
input as conditional. Each task lists its one-time grants directly beneath it,
and a separate completion group lists the final Junction grants. Canonically
linked reward pages point back to every granting Junction. Signed-in reads join
those links to the same private inventory state as repeatable drops, but expose
separate one-time and repeatable counts. The unowned-reward chart filter matches
either category without pretending a grant has a drop chance.

## Current compromise

No imported source supplies stable visual coordinates. Until a human traces and
checks in screenshots through the local layout tool, overview and planet
positions remain deterministic presentation state and do not claim exact
in-game geometry. Screenshot pixels and their copyright are deliberately not
stored; the JSON records only normalized annotations and source image metadata.

Enemy and quest identities are imported, but richer domain-specific facts and
complete curated discovery links remain future work.
Junction reward facts do not currently update inventory, quest progress or
unlock state automatically. Objective and node completion also do not prove a
grant was claimed: inventory remains independently player-authored. A task text
change intentionally creates a new objective key, so a previous completion is
retained privately but ignored by current access until the new task is
completed.
There is not yet automatic account-state import.
