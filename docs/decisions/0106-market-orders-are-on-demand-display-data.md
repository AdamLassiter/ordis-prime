# 0106: Market orders are on-demand display data

## Status

Superseded in part by ADR 0107. The on-demand boundary remains accepted for
individual catalog detail pages; The Index uses bounded daily aggregates.

## Decision

Promote Warframe.market's item manifest as a low-priority static identity source,
but fetch top public orders only when a linked catalog page requests them. Cache
that response briefly and degrade to a direct provider link on failure. Do not
persist orders as catalog facts or require marketplace authentication.

## Consequences

- Stable game references compose market links with the existing canonical
  catalog without name guessing.
- Daily ingestion does not crawl thousands of volatile order books, and normal
  page traffic remains within the provider's documented rate policy.
- Price display is useful context but not planner scoring, sale history, or
  evidence of player ownership.
- Listing management waits for supported public delegated authorization rather
  than collecting credentials for a deprecated login flow.
