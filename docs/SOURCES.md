# Source policy

| Source                  | Initial use                                                                                                                                                                                                                           | Policy                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| WFCD warframe-items     | identities, items, weapon and arcane classes, mod rank/drain/polarity facts, modular weapon representatives/components, Archwings, Archon Shards, node levels/planets, quests                                                         | Fetch the maintained aggregate API endpoint; snapshot, validate, retain version/hash and MIT attribution                                             |
| WFCD warframe-drop-data | mission metadata, enemy, relic and rotation drops                                                                                                                                                                                     | Snapshot mission rewards with payload and retain upstream attribution                                                                                |
| WFCD WarframeStat.us    | live cycles, events, alerts, fissures and traders                                                                                                                                                                                     | Snapshot the PC English aggregate response; normalize absolute availability windows and retain MIT attribution                                       |
| Manual YAML             | published editorial rankings; curated discovery facts and relations; factual overlays                                                                                                                                                 | Require source-specific citations and licence notes; retain each source as an independent versioned set and resolve overlays by explicit external ID |
| WARFRAME Wiki           | weapon, Warframe and Archwing maximum ranks; abilities and powersuit links; quests, sequence and quest-only node access; mission metadata and star-chart connections; external detail links; a curated Archon Shard effect vocabulary | Fetch selected structured data modules through MediaWiki; parse Lua syntax without executing it; retain CC BY-NC-SA 3.0 attribution per fact         |

Provider absence never means deletion. Removals require an explicit tombstone,
and records referenced by player data are retired rather than physically deleted.

Every refresh creates an operational attempt before network access begins. The
attempt records success or a bounded error message and links successful imports
to their promoted source run or world-state snapshot. If a snapshot was retained
before parsing or promotion failed, its path remains attached to the failed
attempt. A failure never changes the previously active data.
Attempt creation uses an immediate database transaction and refuses a second
running attempt for the same source. Different sources remain independent, and
the worker's abandoned-attempt recovery eventually releases a source after a
terminated process.
Successful attempts also persist the number of normalized observations or
world-state windows processed. Source operation pages derive duration and
throughput from those authoritative counts and timestamps. Worker history can
be filtered independently by job kind, status and source payload.

Entity fields, enhancement options, recipes, drops, ranking sets, and individual editorial rankings
retain the source record key plus optional citation URL and source path. The
catalog can therefore explain a typed relation at record level instead of
offering only a provider-level attribution.

Each entity-field provenance row also retains the source's asserted value.
After an active source run changes, canonical fields are recomputed from all
active assertions by source priority, then retrieval time and stable source ID. Removing
a higher-priority assertion therefore reveals the next active value instead of
leaving stale canonical text behind. Optional fields clear when their final
active assertion disappears; the identity-bearing name and slug remain when no
active source asserts a replacement. Provenance created before value retention
preserves its canonical value until that source next refreshes.

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

The automatic WFCD catalog adapters and structured Wiki adapters reject a
candidate that emits fewer than half as many normalized observations as their
previous active run. Each
source run records its input observation count, so this guard is independent of
shorter operational-history retention. The threshold is adapter policy rather
than a global rule: manual sources may intentionally publish a much smaller
replacement and therefore have no implicit shrinkage floor. A first import or a
pre-count source run establishes the baseline without comparison. Data-source
status and operation pages expose the current baseline to administrators.
When parsing succeeds but promotion rejects a candidate, the failed operation
also records the candidate observation count so the attempted size can be
compared directly with that baseline. Failures before normalization leave the
count unknown rather than implying that the source contained zero records.

Promoting any static source creates a catalog release whose membership records
the active run of every static source at that instant. The data-source page
shows the current release ID and versions, so a composed catalog can be audited
without reconstructing membership from later mutable run status.

The worker retains the active release and 20 inactive releases by default.
After older releases are removed, clean inactive source runs that no retained
release references are deleted with their normalized facts. Runs containing a
resolver conflict remain available for review even after their release ages
out. `ORDIS_CATALOG_HISTORY_LIMIT` changes the inactive-release count; zero
keeps only the active release. Immutable raw payloads and refresh-operation rows
are retained independently of catalog pruning.

The worker keeps the newest 1,000 finished source-refresh operations per source
by default and never prunes a running attempt. `ORDIS_SOURCE_REFRESH_HISTORY_LIMIT`
changes that per-source bound; operational counts and throughput therefore
describe the retained window rather than lifetime history. Before applying
retention, the worker marks attempts older than its longest job lease as failed;
this recovers operations stranded by process termination without guessing that
a currently leased request has ended.

After database retention runs, the worker removes content-addressed payload
directories that are no longer referenced by any source run, world-state
snapshot or refresh attempt. Newly written or reused payloads receive a one-hour
grace period by default so concurrent refresh work cannot be collected between
filesystem publication and database attachment. `ORDIS_SNAPSHOT_PRUNE_GRACE_MS`
changes that grace. Running attempts attach their retained path before parsing,
and cleanup failure is reported without claiming a refresh job. Unexpected
directories and temporary writes are never treated as collectible snapshots.

Before staging begins, promotion validates invariants that require the complete
candidate set. Every observation's source, version and retrieval instant must
match the promoted snapshot envelope and its record key must be non-blank. One
external identifier cannot declare contradictory entity
identity, a kind/slug cannot carry conflicting names, singleton node details
and enhancement options cannot be duplicated, and rankings must use one
declared set, tier, and member per subject. These are source-authoring errors,
not resolver ambiguity, so they fail the refresh before a source run is written.
Actual ambiguity against the composed catalog remains a reviewable conflict.

After the incoming source replaces its prior active run, promotion validates
the composed catalog before publishing the release. Every active recipe, drop,
node detail, typed relation, enhancement option and ranking member must still
refer to a non-retired canonical entity. A source therefore cannot tombstone an
identity still used by another active source; the entire promotion rolls back.
Drop locations, node-detail subjects and both endpoints of `connects-to` edges
must additionally resolve to canonical node entities.
Enhancement-option subjects must resolve to canonical Archon Shard entities.
The union of every active recipe alternative must also remain acyclic; a
cross-source cycle invalidates the candidate release.
This is referential liveness validation, not a claim that every expected game
record is present.

The WFCD item adapter also performs a payload-wide identity pass. Shared recipe
materials keep their intrinsic name instead of being repeatedly parent-qualified;
one-off generic components remain qualified. Same-kind display-name collisions
with different provider types receive stable type qualifiers, while store and
internal records with the same name/type intentionally converge. Common WFCD
resource-like types, including Forma's `Equipment Adapter`, map to resources.
For mods, sane `fusionLimit`, `baseDrain` and canonical polarity values become
cited canonical fields. The adapter omits provider placeholder sentinels such
as rank 592 and extreme negative drain rather than turning corrupt metadata into
capacity facts. A parser-version bump ensures retained bytes can be replayed.

Resolver conflicts store the exact external IDs that participated in an entity
observation and the candidate canonical entities. An administrator can close a
conflict as reviewed without changing identity, or bind one of those external
IDs to one of those candidates with a required note. Bindings are explicit,
source-owned, reversible, and append-only audited. Automatic sources are queued
for replay after a binding change; a manual source must be uploaded again. A
successful replay materializes the approved external ID in the canonical map.
Revocation removes both the override and that materialized mapping, reopens the
origin conflict, and changes the replay revision.

The leased worker schedules `wfcd-items`, `wfcd-drops`,
`warframe-wiki-weapons`, `warframe-wiki-warframes`,
`warframe-wiki-missions`, `warframe-wiki-abilities`, and
`warframe-wiki-quests` independently once per
day by default, while world state runs every five minutes. An administrator can
bring any of those queued jobs forward from `/data-sources`; this does not run
network work in the web request or create a duplicate queued job. Manual files
remain explicit imports because the server cannot infer which local documents
an operator intends to publish.
