# 0111: Interface preferences are portable player state

## Status

Accepted.

## Context

Collection-heavy pages need consistent choices for card or table layout,
density, and status emphasis. Keeping independent browser-local switches on
each page would drift and would not follow a player between sessions or
installations.

## Decision

Persist one bounded preference record per player alongside the private profile,
while keeping it logically separate from game progression and inventory facts.
The initial preferences are collection layout, display density, and
collection-state highlighting. Apply density and highlighting through shared
page classes, and let supported collection views use the layout preference.

Include preferences in portable profile schema 22. Use cards, comfortable
density, and labeled badges when no row exists. Reduced-motion and accessible
status labels remain unconditional and cannot be disabled by a preference.

## Consequences

- Preferences survive sessions and profile transfer and disappear with the
  owning account.
- Pages that do not have a meaningful tabular form may keep their purpose-built
  layout while inheriting density and highlighting.
- The collection workspace is the initial view that supports both card and
  table layouts. Catalog search, node rewards, the planner, Circuit schedules,
  and Index tables keep their purpose-built layouts while applying global
  density and shared state-highlighting preferences.
- Adding another preference requires a bounded value set, a documented default,
  and a shared consumer rather than page-specific interpretation.
