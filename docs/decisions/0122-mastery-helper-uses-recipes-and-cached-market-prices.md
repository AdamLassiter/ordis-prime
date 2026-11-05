# 0122: Mastery helper uses recipes and cached market prices

## Status

Accepted.

## Context

An unmastered-item list is more useful when it identifies equipment closest to
completion. Fetching Warframe.market orders while rendering that private list
would turn every visit into a burst of public API calls, couple page latency to
an external service, and make a missing response look like a zero price.

## Decision

The Inventory mastery helper includes every active Warframe, weapon, companion,
Archwing, or vehicle whose private mastery state is not confirmed true. It uses
the player's preferred active recipe when available and otherwise the same
source-priority recipe selection as the Planner.

For each candidate, owned plus built ingredient copies satisfy the selected
recipe. The primary sort is the number of distinct ingredients still missing,
then total missing copies and item name. Already acquired equipment therefore
sorts first with zero missing components. Equipment without an active recipe
remains visible after countable entries rather than receiving an invented
count. The helper does not recursively expand ingredients or estimate Mastery
Rank XP.

Page requests never contact Warframe.market. Tradeable ingredients join the
existing resumable background price run, which stores aggregate listing
estimates. The worker fetches bounded batches with a one-second default delay
between requests. A platinum total sums only missing quantities with a
non-expired cached price and always reports priced/tradeable coverage. Missing
or expired prices remain pending, never zero. Values older than 36 hours are
marked stale and values older than seven days are omitted.

## Consequences

- The list is immediately useful from inventory and recipe facts even before a
  market refresh completes.
- A shown platinum value may be a known subtotal; coverage remains beside it.
- Nontradeable resources still affect component proximity but never acquire a
  fictional market cost.
- A daily price run covers more targets and may take longer, but it remains
  asynchronous, resumable, rate-limited, and shared across players.
