# ADR 0082: Enemy bosses require explicit Wiki classification

## Context

WFCD exposes hundreds of enemy identities, but does not publish a boss flag.
Some internal names happen to contain strings such as `Vip` or `Boss`; treating
those implementation details as a taxonomy would create false positives and
would be difficult to explain to players. The structured Wiki enemy modules
instead publish a documented `General.Type` field whose values include `Boss`.
They are horizontally partitioned by faction.

## Decision

Add an independent `warframe-wiki-enemies` adapter that snapshots the enemy
index and every currently declared faction partition. It emits only records
whose literal `General.Type` is `Boss`, preserving the record key, partition,
revision URL, line and optional cleaned description. Same-name WFCD enemies can
be refined through the existing boss-specific identity rule.

The adapter also reads the index's `COOP_FACTIONS` declaration as a schema
sentinel. A new, removed or renamed partition rejects the refresh until the
adapter is reviewed, rather than silently publishing incomplete boss coverage.
An empty boss result and duplicate boss display names also fail closed.

Planet and mission strings are not promoted as relations. Those arrays can mix
regions, mission types and quest contexts, and therefore do not prove a link to
a canonical Star Chart node.

## Consequences

- Open-world, quest and special-mode bosses can enter the discovery atlas even
  when they have no ordinary mission-node `Boss` field.
- Boss classification is cited and source-owned rather than inferred from
  internal paths or curated name lists.
- Mission-owned `occurs-at` links remain independent, so broader boss coverage
  does not manufacture acquisition or location claims.
- When the upstream Wiki is unavailable, its active catalog run remains
  unchanged and the worker retries normally.
