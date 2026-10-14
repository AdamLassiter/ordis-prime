# ADR 0019: Persist recipe choices by source record identity

## Decision

When multiple active recipes can produce an item, the planner exposes their
sources, ingredients and output quantities. A player's selection is stored by
the canonical output entity plus recipe source ID and source record key. Recipe
database UUIDs are not persisted as player intent.

The planner falls back to source priority and recency when no preference exists
or the preferred recipe is unavailable. It reports an unavailable preference in
the recipe-choice UI and never expands an inactive recipe.

## Rationale

Recipe rows belong to replaceable source runs and receive new UUIDs after a
refresh. Persisting those UUIDs would silently lose choices. Selecting purely by
priority hides legitimate acquisition routes and can produce a plan the player
cannot or does not want to follow.

## Consequences

- Alternatives are shown only for recipe outputs reached by current goals.
- Profile version 9 transfers recipe preferences across installations using a
  portable output reference and stable source record identity.
- An import reports a preference unresolved when the destination lacks that
  active recipe; the rest of the profile still imports.
- The planner does not attempt to declare one alternative cheaper or faster
  without market, mission-duration and expected-run evidence.
