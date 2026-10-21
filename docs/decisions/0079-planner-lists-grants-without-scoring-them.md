# 0079: Planner lists grants without scoring them

Status: accepted

## Context

Recipe expansion can leave a missing item that is available both from mission
drops and as a one-time Junction grant. Hiding the grant makes the planner less
complete, but feeding it into drop recommendation grouping would invent chance,
repeatability and farming value that the source does not assert.

## Decision

For every expanded missing requirement, query active one-time reward facts with
the same canonical entity. Return those as a separate planner collection with
the needed quantity, known grant quantity, trigger, granting node and citation.

Render the collection separately from candidate nodes. Do not pass grants to
drop recommendation scoring, access ordering, expected-run reasoning, or live
world-state intersections. The granting node remains linked so its complete
access evidence and objective progress are one navigation step away.

## Consequences

- The planner exposes another honest acquisition path without suggesting it can
  be repeated to satisfy arbitrary quantities.
- A grant may cover only part of the missing quantity; the UI shows both values
  and leaves allocation or claim tracking for a future explicit model.
- Label-only grants cannot appear because they lack the canonical identity
  needed to match an expanded requirement.
