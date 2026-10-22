# 0093: Foundry owns tasks and Directives own signals

## Context

Player-authored todos and automated world-state watches previously shared the
Directives page. Both are private intent, but they answer different questions:
tasks are work the player chose, while watches are rules that produce timely
alerts. Mixing them obscured the Foundry plan's role as the place to decide what
to acquire next.

## Decision

Place manual and recurring tasks in the Foundry plan beside goals, missing
ingredients and node recommendations. Link entity task shortcuts to
`/planner#tasks`. Reserve Directives for watch creation, watch maintenance and
generated alerts. Persistence and profile formats do not change; this is an
ownership and navigation boundary, not a data migration.

## Consequences

- A player has one planning surface for chosen work and one notification
  surface for changing external state.
- Dynamic opportunities may still appear in the planner as derived suggestions,
  but they are not persisted tasks or alerts.
- Existing task URLs to `/todos` are intentionally replaced; pre-release
  backwards compatibility is not required.
