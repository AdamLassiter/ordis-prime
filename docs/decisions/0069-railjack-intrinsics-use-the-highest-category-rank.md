# 0069: Railjack Intrinsics use the highest category rank

Status: accepted

## Context

WARFRAME Wiki mission data records Proxima access requirements as “Intrinsics
Rank N or higher.” [Digital Extremes' Railjack support documentation](https://support.warframe.com/hc/en-us/articles/38820115630093-Railjack)
clarifies that later Proxima regions unlock by putting points into any
Intrinsics category: Saturn and Neptune require rank 3, Pluto rank 5, and Veil
rank 7.

This is not Mastery Rank, and recording all five category ranks is unnecessary
for the access question. Some mission expressions combine the Intrinsics gate
with one or two completed quests, while adversary confrontations add an active
Lich or Sister condition the application cannot yet represent.

## Decision

Add a cited `railjackIntrinsicRequirement` numeric node-detail fact, bounded to
0 through 10. Add one optional private player input,
`railjackIntrinsicRank`, meaning the highest rank reached in any Railjack
Intrinsics category. Keep both fields separate from Mastery Rank.

Extend the mission adapter's complete-expression allow-list to Intrinsics-only,
quest-plus-Intrinsics and quest-plus-Intrinsics-plus-quest shapes. Emit every
quest relation and the numeric gate only when the entire expression is
supported. Continue to reject adversary mixtures as a whole.

Compare the sourced gate with private progression in the shared access
derivation used by node pages, the star chart and acquisition planner. Missing
private rank is conditional; a lower rank is blocked; a sufficient rank is met.
Include the private rank in portable profiles.

## Consequences

- The adoption-time live import produced 27 Intrinsics gates (11 at rank 3, six
  at rank 5 and ten at rank 7) plus 13 newly complete quest relations, with no
  resolver conflicts.
- Proxima recommendations distinguish missing player input from a known blocker.
- Veil nodes can compose Chimera Prologue and, where present, The War Within
  with the rank 7 gate without understating the expression.
- The model answers access using the minimum private input required and does not
  pretend to be a full Intrinsics build tracker.
- Active Kuva Lich, Sister of Parvos and Technocyte Coda requirements remain
  unmodeled until adversary state has its own typed private representation.
