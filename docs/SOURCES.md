# Source policy

| Source | Initial use | Policy |
| --- | --- | --- |
| WFCD warframe-items | identities, items, weapon and arcane classes, modular weapon representatives/components, Archwings, Archon Shards, node levels/planets, quests | Fetch the maintained aggregate API endpoint; snapshot, validate, retain version/hash and MIT attribution |
| WFCD warframe-drop-data | mission metadata, enemy, relic and rotation drops | Snapshot mission rewards with payload and retain upstream attribution |
| WFCD WarframeStat.us | live cycles, events, alerts, fissures and traders | Snapshot the PC English aggregate response; normalize absolute availability windows and retain MIT attribution |
| Manual YAML | published editorial rankings; curated discovery facts and relations; factual overlays | Require source-specific citations and licence notes; retain each source as an independent versioned set and resolve overlays by explicit external ID |
| Warframe Wiki | external detail links and a curated Archon Shard effect vocabulary | No automated fetching; the checked-in effect source is a cited CC BY-NC-SA 3.0 manual snapshot, and future facts remain segregated and attributable |

Provider absence never means deletion. Removals require an explicit tombstone,
and records referenced by player data are retired rather than physically deleted.

Every refresh creates an operational attempt before network access begins. The
attempt records success or a bounded error message and links successful imports
to their promoted source run or world-state snapshot. If a snapshot was retained
before parsing or promotion failed, its path remains attached to the failed
attempt. A failure never changes the previously active data.
Successful attempts also persist the number of normalized observations or
world-state windows processed. Source operation pages derive duration and
throughput from those authoritative counts and timestamps. Worker history can
be filtered independently by job kind, status and source payload.

Entity fields, enhancement options, recipes, drops, ranking sets, and individual editorial rankings
retain the source record key plus optional citation URL and source path. The
catalog can therefore explain a typed relation at record level instead of
offering only a provider-level attribution.

Adapter parser versions form part of static snapshot versions. Re-fetching an
already-active identical version is a successful no-op; a parser change uses a
new version suffix so retained upstream bytes can be interpreted into a new run.
An active identity override revision similarly forms part of the promoted
version, while the stored snapshot retains its original upstream version and
hash. This lets the resolver replay unchanged bytes into a new immutable source
run after an operator binds or revokes an ambiguous external ID.
Arcanes use WFCD's explicit `Arcanes` category. Archon Shards are classified by
their stable `/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystal` internal-name
prefix because the aggregate currently labels both their category and type as
`Misc`; this provider-specific rule is isolated in the adapter.

Promoting any static source creates a catalog release whose membership records
the active run of every static source at that instant. The data-source page
shows the current release ID and versions, so a composed catalog can be audited
without reconstructing membership from later mutable run status.

Resolver conflicts store the exact external IDs that participated in an entity
observation and the candidate canonical entities. An administrator can close a
conflict as reviewed without changing identity, or bind one of those external
IDs to one of those candidates with a required note. Bindings are explicit,
source-owned, reversible, and append-only audited. Automatic sources are queued
for replay after a binding change; a manual source must be uploaded again. A
successful replay materializes the approved external ID in the canonical map.
Revocation removes both the override and that materialized mapping, reopens the
origin conflict, and changes the replay revision.

The leased worker schedules `wfcd-items` and `wfcd-drops` independently once per
day by default, while world state runs every five minutes. An administrator can
bring any of those queued jobs forward from `/data-sources`; this does not run
network work in the web request or create a duplicate queued job. Manual files
remain explicit imports because the server cannot infer which local documents
an operator intends to publish.
