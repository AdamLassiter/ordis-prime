# Source policy

| Source | Initial use | Policy |
| --- | --- | --- |
| WFCD warframe-items | identities, items, components, node levels/planets, quests | Fetch the maintained aggregate API endpoint; snapshot, validate, retain version/hash and MIT attribution |
| WFCD warframe-drop-data | mission metadata, enemy, relic and rotation drops | Snapshot mission rewards with payload and retain upstream attribution |
| WFCD WarframeStat.us | live cycles, events, alerts, fissures and traders | Snapshot the PC English aggregate response; normalize absolute availability windows and retain MIT attribution |
| Manual YAML | published editorial rankings; curated discovery facts and relations; factual overlays | Require source-specific citations and licence notes; retain each source as an independent versioned set and resolve overlays by explicit external ID |
| Warframe Wiki | external detail links only in v1 | No automated fetching; future facts remain segregated and attributable |

Provider absence never means deletion. Removals require an explicit tombstone,
and records referenced by player data are retired rather than physically deleted.

Every refresh creates an operational attempt before network access begins. The
attempt records success or a bounded error message and links successful imports
to their promoted source run or world-state snapshot. If a snapshot was retained
before parsing or promotion failed, its path remains attached to the failed
attempt. A failure never changes the previously active data.

Entity fields, recipes, drops, ranking sets, and individual editorial rankings
retain the source record key plus optional citation URL and source path. The
catalog can therefore explain a typed relation at record level instead of
offering only a provider-level attribution.

Adapter parser versions form part of static snapshot versions. Re-fetching an
already-active identical version is a successful no-op; a parser change uses a
new version suffix so retained upstream bytes can be interpreted into a new run.

The leased worker schedules `wfcd-items` and `wfcd-drops` independently once per
day by default, while world state runs every five minutes. An administrator can
bring any of those queued jobs forward from `/data-sources`; this does not run
network work in the web request or create a duplicate queued job. Manual files
remain explicit imports because the server cannot infer which local documents
an operator intends to publish.
