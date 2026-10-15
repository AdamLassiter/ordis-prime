# 0029: Todo recurrence uses anchored calendar rules

Status: accepted

## Context

A numeric day interval can express “every seven days,” but it cannot faithfully
express player routines such as monthly on the 31st, the first Sunday of each
month, or yearly on February 29. Re-deriving a schedule from each generated due
date also creates drift: clamping January 31 to February 28 would permanently
move later occurrences to the 28th.

Todos and exported profiles are pre-release data, so preserving the old storage
shape is not a requirement.

## Decision

Store recurrence as a discriminated JSON rule alongside the date-only UTC due
date. Supported rules are a bounded day interval, weekday, month date, monthly
weekday ordinal (first through fourth or last), and yearly month/date.

The initial due date supplies the calendar anchor. Every generated occurrence
copies the same rule and calculates its next date from that rule. Dates that do
not exist in a target month clamp to its final day without changing the stored
anchor. The unique recurrence predecessor remains the idempotency boundary.

Profile schema 11 exports the structured rule and validates every predecessor
edge by calculating the expected next due date. Schema 10 is intentionally not
accepted.

## Consequences

- Calendar intent survives short months, leap years, and profile transfers.
- A recurrence remains date-only; it does not imply a notification instant or
  player timezone.
- The create form derives the rule from the chosen due date. It cannot currently
  express a weekday or calendar anchor different from that first occurrence.
- Existing pre-release `recurrence_days` values are dropped by migration rather
  than guessed into the new representation.
