# 0112: Collection state is derived on read

## Status

Accepted.

## Context

Ownership, mastery history, player-authored intent, and acquisition goals answer
different questions. Earlier views used local `needed` checks, commonly treating
every unowned reward as wanted. That made a mastered-but-unowned weapon look
unfinished and made non-mastery resources appear to express player intent.

## Decision

Keep the persisted evidence separate and derive presentation state through one
domain function:

- acquired means the owned or built count is positive;
- explicitly wanted means the persisted wanted count is positive;
- mastery-capable equipment is suggested while mastery is not confirmed;
- a confirmed mastered item is never suggested merely because it is unowned;
- a goal-derived requirement is labeled separately and does not mutate wanted
  count; and
- non-mastery items have no implicit wanted state.

Use a shared accessible indicator component in player-aware catalog results,
entity details, node rewards, planner results, Circuit schedules, market Index
tables, and the collection workspace. Labels remain present in every highlight
mode; colour is supplementary.

The collection workspace starts from a bounded collection-kind allow-list and
left-joins player state, so absence is visible as zero/unknown rather than
absence from the page. Raw resources and crafting components remain excluded
until stack, consumption, and import semantics are modeled rather than being
forced into equipment-style counts.

## Consequences

- Views may choose badges, compact table cells, or emphasis, but cannot redefine
  the underlying states.
- Explicit wanted counts remain portable player-authored data; mastery and goal
  suggestions are recomputed.
- The current mastery helper reports confirmed, unconfirmed, and unknown item
  counts. It does not invent XP totals or a rank forecast before sourced XP
  values exist.
- Market presence is shown as an optional trade shortcut alongside normal
  acquisition evidence, never as a universal recommendation.
