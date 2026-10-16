# 0043: Active recipe graphs are acyclic

Status: accepted

## Context

The domain planner detects recipe recursion to avoid looping forever, but that
made malformed catalog composition a player-facing runtime failure. A cycle may
also span sources: one provider can define A from B while another defines B from
A, even though each input is internally plausible in isolation.

Recipe alternatives make selection-specific validation fragile. A newly chosen
preference or a withdrawn preferred recipe could expose a cycle that was
already present in the active catalog.

## Decision

After switching the incoming source run and before publishing the release,
build a directed graph from every active recipe output to each ingredient.
Reject the composition when depth-first traversal finds any visiting node
reachable again, including a direct self-ingredient.

Validate the union of all active alternatives rather than only the current
default recipe. Keep the domain planner's defensive cycle check as a final
in-memory guard for callers that construct recipes outside the catalog.

## Consequences

- A recipe cycle rolls back the incoming run, its facts and active membership.
- Cross-source cycles are caught at publication rather than when a player opens
  the planner.
- Every active alternative remains safe to select or become the fallback.
- The conservative union rule could reject a source whose cyclic alternative
  would never be selected; such an alternative is still considered invalid
  catalog evidence rather than dormant data.
