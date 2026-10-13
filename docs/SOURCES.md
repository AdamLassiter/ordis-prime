# Source policy

| Source | Initial use | Policy |
| --- | --- | --- |
| WFCD warframe-items | identities, items, components, nodes, quests | Fetch the maintained aggregate API endpoint; snapshot, validate, retain version/hash and MIT attribution |
| WFCD warframe-drop-data | mission, enemy, relic and rotation drops | Snapshot `info.json` with payload and retain upstream attribution |
| Manual YAML | published editorial rankings; corrections later | Require citation, author, date, scope and licence note; retain each source as an independent set |
| Warframe Wiki | external detail links only in v1 | No automated fetching; future facts remain segregated and attributable |

Provider absence never means deletion. Removals require an explicit tombstone,
and records referenced by player data are retired rather than physically deleted.
