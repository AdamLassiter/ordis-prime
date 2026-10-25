# 0107: Market uses bounded aggregate snapshots

## Status

Accepted. Supersedes the order-fetch boundary in ADR 0106 for catalog-wide
analysis; item detail pages may still use their short-lived on-demand cache.

## Decision

Fetch public Warframe.market order books once daily for the bounded set consumed
by Market: relics, their rewards, Standing-offered mods, and Arcanes. Persist
only two aggregates per explicit subtype or rank: the median of the five cheapest
online sells and the best online buy, plus sample counts and freshness metadata.

Use exact WFCD and Warframe.market identifiers to join prices to canonical
entities. Treat same-game-reference marketplace entries such as an item and its
set as distinct identities. Collapse WFCD relic refinement records into one base
relic while retaining refinement-specific probabilities.

## Consequences

- Cross-catalog comparisons use one coherent snapshot instead of thousands of
  page-triggered caches observed at unrelated times.
- Resumable batches respect the provider request rate and survive worker restarts.
- The database cannot reproduce individual orders or identify traders.
- Prices remain asking/bid evidence rather than completed-sale history.
- Provider identity anomalies fail visibly or remain separate instead of being
  merged by similar names.
