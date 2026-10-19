# 0067: Node completion is private player state

Status: accepted; bulk editing added by decision 0070

## Context

The catalog records sourced nodes, connections and access requirements, while
discovery progress records whether a player has learned about or completed a
quest, mechanic or secret. Clearing a star-chart node is neither a catalog fact
nor discovery progress. It also cannot be inferred from graph connectivity: a
source edge says nodes are adjacent, not that a player has cleared either one.

Players need completion state to combine the chart with personal checklists and
eventually evaluate requirements such as “complete the preceding node.”

## Decision

Store completed nodes in a dedicated `player_node_progress` table keyed by user
and canonical node. Absence means incomplete. Preserve the first completion
time across repeated completed writes, while recording the latest update time.

Expose completion only on authenticated node reads and star-chart views. Allow
players to edit it on node pages and filter the chart by completed or incomplete
nodes. Include completed nodes in portable profiles using canonical portable
entity references and an ISO completion timestamp.

Do not treat completion as proof that a node is currently available, and do not
derive it from sourced connections or access requirements.

## Consequences

- Catalog truth and private progress remain independently replaceable.
- A profile transfer can retain both completion identity and timing.
- Signed-out users do not receive a fabricated default for private state.
- Imported node-completion prerequisites consume this state without overloading
  discovery progress, as specified by decision 0068.
- Filtered bulk edits replace only their explicit visible scope, as specified by
  decision 0070.
- The current UI records only completed versus incomplete; objective-level
  Junction progress and mission variants need their own models.
