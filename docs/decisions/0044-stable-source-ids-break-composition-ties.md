# 0044: Stable source IDs break composition ties

Status: accepted

## Context

Source priority and retrieval time normally determine a composed fact winner.
Several read paths used generated run or fact UUIDs as the final tie-breaker.
Those UUIDs differ between installations, so importing identical sources in a
different order could change a canonical field, enhancement label, node detail
or default recipe selection.

Portable player state and reproducible source releases require the same inputs
to produce the same visible defaults independently of local row identities.

## Decision

After descending source priority and retrieval time, order competing sources by
their stable source ID ascending. Within one source, use its stable source record
key before the generated row ID where multiple alternatives are allowed.

Apply this policy to canonical entity-field recomputation, enhancement-option
winners, node-detail field selection, planner Mastery Rank gates and automatic
recipe selection. Keep generated IDs only as a final fallback for legacy facts
without distinct record keys.

## Consequences

- Equal-priority, equal-time source composition is reproducible across fresh
  installations and import order.
- A source ID now has visible ordering significance in an otherwise exact tie;
  source priority remains the explicit way to express authority.
- Existing installations may select a different tied value or default recipe
  after refresh, but there is no pre-release compatibility requirement.
- Player recipe preferences still override the automatic ordering by stable
  source ID and source record key.
