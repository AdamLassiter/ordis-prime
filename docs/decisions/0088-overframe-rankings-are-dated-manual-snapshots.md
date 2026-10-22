# 0088: Overframe rankings are dated manual snapshots

Status: accepted

## Context

Overframe offers useful community-voted tiers across six public categories,
which gives the initially empty ranking comparison meaningful disagreement and
coverage. Treating the site as another automatic catalog provider would require
an ongoing third-party API dependency or page crawler, while obscuring that
votes are subjective and patch-sensitive.

The captured public list logic treats an item with fewer than 40 votes as
unranked. For ranked items, the displayed tier is the tier with the greatest
vote count; ties follow display order from S through D.

## Decision

Keep one versioned manual-ranking YAML file with a stable source ID for each of
Warframes, primary weapons, secondary weapons, melee weapons, Archwing
equipment, and companions.
Each file cites an immutable Internet Archive capture of the public tier-list
response, includes only entries meeting the 40-vote threshold, records its
captured vote total, and maps the plurality tier to the declared
`[S, A, B, C, D]` scale.

Resolve every subject by its exact active WFCD `uniqueName`. Keep the category
sources independent so scope, coverage, snapshot date, and future replacement
remain explicit.

Do not add an Overframe network adapter, crawler, scheduled job, or implicit
refresh. Updating a list is a deliberate editorial operation that replaces the
checked-in YAML with a newly reviewed and cited snapshot. Its stable source ID
promotes the replacement instead of accumulating an obsolete second source.

## Consequences

The ranking screen has broad starter coverage without coupling normal
operations to Overframe. The records remain inspectable through the ordinary
manual-source provenance pipeline and can disagree with other sources.

The data is a historical view of community voting, not an objective evaluation
or a live feed. Different categories currently have different capture dates,
and they remain stale until a person updates them. Build guides, descriptions,
and page copy are not copied.
