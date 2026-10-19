# 0064: Partial prose requirements do not imply access

Status: accepted; grammar extended by decision 0068

## Context

The WARFRAME Wiki's versioned
[`Module:Missions/data`](https://wiki.warframe.com/w/Module:Missions/data)
contains a `Requirements` string for selected nodes. Some strings contain only
one or more completed quests. Others combine a quest with a Warframe level,
Intrinsics rank, item, previously completed node or active adversary.

The planner treats all known access facts as a complete conjunction. Importing
only the recognizable quest from a mixed expression could therefore mark a node
available while an unmodeled condition still blocks it.

## Decision

Version the Wiki mission adapter over both the mission and quest-key modules.
Resolve Wiki links against the current structured quest names and article links.
Emit `node requires quest` relations only for a small, anchored grammar where
the entire requirement expression consists of one or two completed quests.

Ignore the entire expression if it includes an unrecognized link or any extra
condition. Do not infer requirements from ordinary article prose. Emit the
referenced quest identities from the mission source so a mission refresh is
self-contained and does not rely on adapter execution order; the dedicated
quest source later composes through canonical name and kind identity.

## Consequences

- The adoption-time live import produced 47 quest requirements alongside 334
  chart connections, with no resolver conflicts.
- Node pages expose cited requirements and signed-in discovery progress. The
  acquisition planner consumes the same relations without provider-specific
  logic.
- Elite Sanctuary Onslaught's level requirement, Railjack Intrinsics gates,
  locator and beacon costs, and active-adversary checks remain unknown rather
  than being understated. Exact node-completion rules are covered by decision 0068.
- New upstream wording fails closed until its complete semantics are modeled or
  the anchored grammar is deliberately extended with regression fixtures.
