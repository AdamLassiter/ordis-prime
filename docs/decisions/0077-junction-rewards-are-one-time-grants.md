# 0077: Junction rewards are one-time grants

Status: accepted

## Context

Each Wiki Junction task row contains an objective and heterogeneous rewards.
The final row grants more rewards for completing the Junction. Items, currency,
blueprints, quests and system unlocks all occur in the same table, but none is a
repeatable mission drop with a chance or rotation.

Keeping only display prose would prevent item-to-Junction navigation. Reusing
the drop model would falsely imply repeatability and contaminate acquisition
recommendations. Reward identity also cannot depend on table position because
the sourced objective text may change independently.

## Decision

Store Junction rewards as dedicated `node-reward` observations. Every fact has
a cited display label, trigger and stable content-derived key. An objective
reward also references that objective's content-derived key; a final-row reward
uses the distinct `junction-completion` trigger. Promotion requires a referenced
objective to exist for the same node and active source run.

Retain a positive quantity when source syntax expresses one. Link the fact to a
canonical reward entity when its typed template or link can be interpreted
safely, but keep the label independently so an unresolvable future reward need
not disappear. Multi-quest cells become one grant per quest.

Expose grants below their objectives and in a separate completion group on the
node page. A linked reward entity exposes reciprocal Junction acquisition. Do
not include these facts in repeatable drops, drop counts, chance calculations or
planner recommendations.

## Consequences

- A player can move between a Junction task and the item, quest or unlock it
  grants without losing source attribution.
- Source refreshes can replace reward facts atomically without changing private
  objective progress identity.
- Completing an objective does not automatically change inventory, quest or
  unlock state; that requires an explicit future player-state design.
- Unrecognized reward syntax can remain a useful cited label without forcing a
  false canonical identity.
