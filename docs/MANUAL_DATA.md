# Manual data

Manual data is a first-class source, not an edit to imported WFCD facts. This
keeps opinion, provenance, and canonical game data separable while still
allowing them to link through stable entity IDs.

## Star Chart layout annotations

`/star-chart/layout` is a local browser tool for tracing the zoomed-out Origin
System or one planet from a screenshot. It exports `schemaVersion: 1` JSON with
normalized 0–1 coordinates for overview planet circles, optional arc control
points, planet mission nodes and junction markers. Save the result as
`data/manual/star-chart-layout.json`, or set `ORDIS_STAR_CHART_LAYOUT` to another
path. The rendered chart consumes partial files and derives fallback positions
for anything omitted.

This file is presentation input, not a promoted catalog source: it never
creates nodes or routes and cannot override cited topology. Screenshots stay in
the browser and are not included in the JSON. Labels must match overview planet
names; per-planet node labels are normalized to catalog slugs.

## Editorial ranking format

Version 2 YAML contains source metadata, an ordered tier scale, an explicit
subject source/namespace, and entries linked by values in that namespace. This
lets the same format rank WFCD equipment, Wiki abilities, or later canonical
subjects without overloading one identifier field. The required source fields are ID, title, author,
URL, publication date, scope, and a licence/citation note. An entry contains an
external ID and tier; position, video timestamp, and notes are optional. See
`data/manual/editorial.example.yaml` for the complete shape.

Import a file after the WFCD item catalog so its subjects can resolve:

```sh
pnpm data:refresh manual-ranking:data/manual/editorial.example.yaml
```

Administrators can also upload any of the three YAML formats from
`/data-sources`. Uploads are limited to 1 MB, parsed as untrusted input, and
passed directly to the same immutable snapshot, observation and transactional
promotion pipeline. The browser never supplies a server filesystem path.
A preview button runs the exact parser, resolver and promotion transaction and
then rolls back every database write without retaining the uploaded bytes. It
reports observation and promoted-record counts plus conflicts. Import is a
separate submission and revalidates the selected file; preview is not an
authorization token and cannot make a later changed file safe.

The original YAML is stored as an immutable snapshot. Ranking sets and their
entries are versioned by source run, so different authors and dates remain
independently queryable rather than being collapsed into a consensus score.

### Overframe starter sets

Seven checked-in ranking files cover Warframes, primary weapons, secondary
weapons, melee weapons, Archwing equipment, companions, and Helminth abilities. Import all of them
after `wfcd-items`:

```sh
pnpm data:rankings:overframe
```

These are manually curated snapshots, not an Overframe integration. Each file
cites an immutable archived response, keeps only entries that had at least 40
votes (the public list's ranked threshold at capture time), records the vote
count in the entry note, and assigns the tier with the largest vote count.
Equal vote counts resolve in displayed scale order, from S through D. Equipment
subjects use exact WFCD `uniqueName` identifiers; Helminth subjects use exact
WARFRAME Wiki ability-record identifiers.

Snapshot dates differ because the latest preserved response differed by list.
The application does not fetch, schedule, or refresh Overframe data. A future
update requires a human to review a newly cited snapshot and replace the
relevant YAML deliberately.

The public `/rankings` view shows each active source's declared scale, scope,
game version and citation beside a matrix of its entries. Values remain verbatim
and blank cells remain blank. The table can be filtered by canonical item name
and source subset, reports source coverage per item, and shows up to 1,000
matching items. Results can be ordered alphabetically or by normalized position
within each source's declared scale. Selecting one source exposes a dedicated
tier-grouped view, including lists such as Overframe melee that exceed 200 items.

### Creator transcript sets

Nine checked-in ranking files transcribe the creator videos represented under
`data/unstructured`: Brozime's 2026 Warframe roster review, KnightmareFrame's
separate average-investment and high-investment Warframe lists, and Salt Prime's
Coda, Kuva, Tenet, primary Prime, secondary Prime and melee Prime lists. Import
them after `wfcd-items`:

```sh
pnpm data:rankings:creators
```

`data/manual/transcript-conversion-index.yaml` records every input transcript,
its hash and every reviewed output. Names are reviewed against WFCD identities; qualifications such
as Incarnon form, firing mode, platform, speculative placement and conditional
S tier remain in entry notes.

An opt-in derived ordinal column maps each source's ordered scale from 0% at its
best tier to 100% at its worst, spaces intermediate tiers evenly, then displays
the median and full range for an item. It requires at least two covered sources
whose scales contain at least two tiers. Every source has equal weight; missing
entries are excluded. Within-tier position, publication date, game version and
scope differences are deliberately not adjusted. Raw tiers and citations stay
visible beside the derived result so the calculation can be inspected rather
than mistaken for source truth.

## Editorial compromise

The editorial v2 format handles tier sets only. The bundled Overframe sets are
dated community popularity evidence, not objective power rankings, and become
stale as votes and game balance change. Its derived view is an ordinal
comparison, not a claim that unlike verbal tiers have shared cardinal meaning.
It does not weight source expertise, recency, patch relevance, scope, or
coverage. Before stable release, `schemaVersion: 2` may be replaced rather than
migrated; there is no pre-release compatibility promise.

## Discovery format

Discovery YAML is a separate format because factual entities and relationships
have different validation and review needs from editorial rankings. It defines
cited quests, mechanics, secrets, enemies, bosses or nodes under stable local
keys, then joins them with typed `requires`, `unlocks`, `occurs-at`, `involves`,
`rewards`, `follows` or `connects-to` relationships. A relationship endpoint may be a local key or an
explicit `{ sourceId, namespace, value }` reference to an entity imported by
another source. See `data/manual/discovery.example.yaml`.

Import catalog sources referenced by the file first, then run:

```sh
pnpm data:refresh manual-discovery:data/manual/discovery.example.yaml
```

Every entity and relationship carries its YAML path, source record key and a
citation URL (the source URL by default, or an entry/relation override). Missing
external endpoints become ingestion conflicts; misspelled local keys fail
validation before promotion.

The current format cannot express conditional relationships. Those require
explicit semantics rather than overloading free-form notes.

## Factual overlay format

Factual overlays correct or enrich canonical entity fields without modifying a
provider snapshot. Version 1 YAML declares an independently cited source and
targets every entry by an explicit `{ sourceId, namespace, value }` identifier.
Display names are never used to guess the correction target. An entry can
provide a name, slug, description, canonical `arcaneClass` or `weaponClass`,
canonical `modularPartRole`, equipment `equipmentMaxRank`, canonical mod `modMaxRank`,
`modBaseDrain` or `modPolarity` facts, aliases,
sourced `enhancementOptions`, or the explicit tombstone
`retired: true`; `retired: false` is rejected because restoration needs a
separate reviewed operation. See `data/manual/facts.example.yaml`.

Import the target provider first, then the overlay:

```sh
pnpm data:refresh wfcd-items
pnpm data:refresh manual-facts:data/manual/facts.example.yaml
```

Source priority determines the active value for name, slug, description, arcane
class, weapon class, and mod capacity fields.
Equipment maximum rank follows the same field-level selection rules.
Modular part role follows them as well.
The default manual priority is 300, above the bundled providers, while each
field retains the overlay's source record, YAML path, snapshot, and citation.
Later provider refreshes therefore cannot silently erase an accepted
correction. Aliases supplement identity matching rather than replacing a
canonical field.

`arcaneClass` accepts `warframe`, `operator`, `amp`, `primary`, `secondary`,
`melee`, `kitgun`, `zaw`, `bow`, or `shotgun`, and is valid only on an `arcane`
entry. WFCD normally supplies this field; an overlay can cite a correction
without teaching build consumers about provider-specific type labels.

`weaponClass` accepts `primary`, `secondary`, `melee`, `bow`, `shotgun`,
`kitgun`, `zaw`, `archgun`, `archmelee`, `companion`, or `amp`, and is valid
only on a `weapon` entry. The normalized class drives equipment-slot and
specialized-arcane validation.

`modularPartRole` accepts `kitgun-chamber`, `kitgun-grip`, `kitgun-loader`,
`zaw-strike`, `zaw-grip`, or `zaw-link`, and is valid only on a `weapon` or
`component` entry. It identifies a part's structural role without claiming
finished-weapon statistics or compatibility beyond its family.

`equipmentMaxRank` accepts an integer from 30 through 40 on Warframes,
weapons, companions and Archwings. It is deliberately separate from a player's
current build rank. The field lets source adapters identify ordinary rank-30
equipment and exceptional rank-40 equipment without embedding name lists in
capacity calculations.

Mod facts are valid only for `kind: mod`. Maximum rank is an integer from zero
through ten; base drain is an integer from -4 through 10 so aura and stance
capacity bonuses remain representable. Polarity accepts `aura`, `madurai`,
`naramon`, `penjaga`, `umbra`, `unairu`, `universal`, `vazarin`, or `zenurik`.
These fields are independently cited and follow normal source-priority rules.

Enhancement options contain a stable lowercase-hyphen key and a concise label.
They are immutable source-run facts rather than fields copied onto an entity.
The checked-in `data/manual/archon-shard-effects.yaml` file provides cited
normal and Tauforged Archon Shard choices from the official WARFRAME Wiki. It
must be imported after `wfcd-items` so all explicit targets resolve:

```sh
pnpm data:refresh manual-facts:data/manual/archon-shard-effects.yaml
```

An unresolved target, mismatched entity kind, or unregistered target source is
recorded as an ingestion conflict. It is never redirected by a similar display
name. Manual sources remain explicit operator imports—by CLI or administrator
upload—and are not scheduled by the background worker.
