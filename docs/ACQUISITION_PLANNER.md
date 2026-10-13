# Acquisition planner

Player goals are desired final quantities of canonical entities. The planner
subtracts owned and built copies, recursively expands the preferred active
recipe, and groups remaining leaf requirements by documented drop location.
Goals and inventory are private player state; recipes and drops remain catalog
facts and are never copied into a profile-specific graph.

When multiple active sources provide a recipe for the same output, the planner
uses the source with the highest configured priority, then the newest source
run. Recommendations show coverage, remaining quantity, documented chance, and
rotation. They deliberately do not estimate farming time because the catalog
does not yet carry reliable mission-duration or expected-run evidence.

The current planner does not account for node access, alternative recipes,
market acquisition, relic refinement, or rotation-specific mission duration.
Those inputs should extend the planning read model rather than becoming UI-only
heuristics.
