# 0058: Legendary ranks use a combined progression number

Status: accepted

## Context

The private player profile previously capped Mastery Rank at 30 because its only
consumer was a star-chart gate. Current mod-capacity rules continue increasing
minimum capacity after Mastery Rank 30: Legendary Rank 1 acts as combined rank
31, Legendary Rank 2 as 32, and so on. Treating every Legendary player as rank
30 would understate capacity on rank-40 equipment.

## Decision

Store one optional combined progression number. Values zero through 30 mean the
ordinary Mastery Rank, and values above 30 mean Legendary Rank offset from 30.
Accept integer values through 40, matching the current equipment-rank ceiling.

Use the same value for numeric progression gates and capacity calculations.
Keep it in private portable player state and advance the unreleased profile
format to version 15 rather than accepting the old ambiguous representation.

## Consequences

- Legendary Rank 1 is entered and exported as 31.
- Existing star-chart comparisons remain numerically correct because sourced
  gates do not exceed 30.
- The input ceiling is a validation bound, not a claim that Legendary Rank 10
  is currently attainable; it can be replaced before release if equipment or
  progression limits change.
