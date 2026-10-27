# 0088: Overframe rankings are dated manual snapshots

Status: accepted

## Context

Overframe offers useful community-voted tiers across seven public categories,
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
equipment, companions, and Helminth abilities.
Each file cites an immutable Internet Archive capture of the public tier-list
response, includes only entries meeting the 40-vote threshold, records its
captured vote total, and maps the plurality tier to the declared
`[S, A, B, C, D]` scale.

Resolve equipment subjects by exact active WFCD `uniqueName` and Helminth
subjects by exact active Wiki ability identifiers. Keep the category sources
independent so scope, coverage, snapshot date, and future replacement remain
explicit.

Do not add an Overframe network adapter, crawler, or implicit upstream refresh.
Production images bundle the reviewed YAML and the worker promotes each file
only after its declared subject source is active. Its ordinary catalog schedule
may re-read that local immutable input, but cannot discover changes on
Overframe. Updating a list is a deliberate editorial operation that replaces
the checked-in YAML with a newly reviewed and cited snapshot. Its stable source
ID promotes the replacement instead of accumulating an obsolete second source.

## Consequences

The ranking screen has broad starter coverage without coupling normal
operations to Overframe. The records remain inspectable through the ordinary
manual-source provenance pipeline and can disagree with other sources.

A fresh production database receives the bundled rankings without a separate
operator command. Subject-source gating prevents the initial import from racing
the canonical identities it references.

The data is a historical view of community voting, not an objective evaluation
or a live feed. Different categories currently have different capture dates,
and they remain stale until a person updates them. Build guides, descriptions,
and page copy are not copied.
