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
Promotion validates the union of active recipe alternatives as an acyclic
dependency graph. A bad source therefore cannot defer a cycle failure until a
player selects the affected goal or alternative.

Recommendations show coverage, remaining quantity, documented chance, and
rotation. They deliberately do not estimate farming time because the catalog
does not yet carry reliable mission-duration or expected-run evidence.

For a canonical node, the planner also composes active cited access relations.
Both `node requires prerequisite` and `prerequisite unlocks node` express a
requirement. A player has satisfied that requirement only when the related
discovery topic or prerequisite node is completed. Candidate nodes with satisfied documented
requirements are listed first, nodes without access evidence remain explicitly
unknown, and documented blocked nodes remain visible with their blockers. The
planner does not infer access from graph connectivity or from an absent fact.
Structured Wiki mission data supplies allow-listed complete expressions made
from completed quests and nodes, including Vehrvod District's quest-plus-node
condition. Other compound prose conditions are not partially imported, because
satisfying the imported subset would otherwise produce a false available state.

The highest-priority active node-detail fact may also provide a numeric Mastery
Rank gate. A private, portable player rank marks that gate met or blocked. If
the gate is documented but the player has not recorded a rank, the node is
shown as conditional rather than guessed available or collapsed into unknown.

The planner also joins current and upcoming world-state windows whose
conservatively reconciled canonical node appears in its recommendations. These
are shown as expiring live opportunities with the missing rewards they cover.
This is a node intersection, not a claim that the live modifier improves the
documented drop chance. Unresolved provider node labels cannot produce an
opportunity.

Node access currently covers curated quest, mechanic, secret, enemy and boss
relations, structured quest and node-completion Wiki requirements, and sourced
numeric Mastery Rank gates. Junction rules and other compound conditions, market acquisition, relic
refinement, and rotation-specific mission duration are not yet modeled.
Those inputs should extend the planning read model rather than becoming UI-only
heuristics.
