# Acquisition planner

Player goals are desired final quantities of canonical entities. The planner
subtracts owned and built copies, recursively expands the selected active
recipe, and groups remaining leaf requirements by documented drop location.
Goals and inventory are private player state; recipes and drops remain catalog
facts and are never copied into a profile-specific graph.

When multiple active sources provide a recipe for an output reached by current
goals, the planner shows every alternative with its source, stable record key,
output quantity and ingredients. It initially uses the highest-priority source,
then the newest source run. A player can choose another recipe; that preference
is stored by source ID and record key so a provider refresh can replace the
internal recipe row without losing the choice. If the preferred recipe is no
longer active, the UI reports the fallback instead of expanding stale facts.

Recommendations show coverage, remaining quantity, documented chance, and
rotation. They deliberately do not estimate farming time because the catalog
does not yet carry reliable mission-duration or expected-run evidence.

The planner also joins current and upcoming world-state windows whose
conservatively reconciled canonical node appears in its recommendations. These
are shown as expiring live opportunities with the missing rewards they cover.
This is a node intersection, not a claim that the live modifier improves the
documented drop chance. Unresolved provider node labels cannot produce an
opportunity.

The current planner does not account for node access, market acquisition, relic
refinement, or rotation-specific mission duration.
Those inputs should extend the planning read model rather than becoming UI-only
heuristics.
