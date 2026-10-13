# Source policy

| Source | Initial use | Policy |
| --- | --- | --- |
| WFCD warframe-items | identities, items, components, nodes, quests | Fetch the maintained aggregate API endpoint; snapshot, validate, retain version/hash and MIT attribution |
| WFCD warframe-drop-data | mission, enemy, relic and rotation drops | Snapshot `info.json` with payload and retain upstream attribution |
| Manual YAML | published editorial rankings; corrections later | Require citation, author, date, scope and licence note; retain each source as an independent set |
| Warframe Wiki | external detail links only in v1 | No automated fetching; future facts remain segregated and attributable |

Provider absence never means deletion. Removals require an explicit tombstone,
and records referenced by player data are retired rather than physically deleted.

Every refresh creates an operational attempt before network access begins. The
attempt records success or a bounded error message and links successful imports
to their promoted source run. If a snapshot was retained before parsing or
promotion failed, its path remains attached to the failed attempt. A failure
never changes the previously active source run.

Entity fields, recipes, drops, ranking sets, and individual editorial rankings
retain the source record key plus optional citation URL and source path. The
catalog can therefore explain a typed relation at record level instead of
offering only a provider-level attribution.
