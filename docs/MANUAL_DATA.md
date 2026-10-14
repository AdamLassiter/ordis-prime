# Manual data

Manual data is a first-class source, not an edit to imported WFCD facts. This
keeps opinion, provenance, and canonical game data separable while still
allowing them to link through stable entity IDs.

## Editorial ranking format

Version 1 YAML contains source metadata, an ordered tier scale, and entries
linked by WFCD `uniqueName`. The required source fields are ID, title, author,
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

The original YAML is stored as an immutable snapshot. Ranking sets and their
entries are versioned by source run, so different authors and dates remain
independently queryable rather than being collapsed into a consensus score.

The public `/rankings` view shows each active source's declared scale, scope,
game version and citation beside a matrix of its entries. Values remain verbatim
and blank cells remain blank; the application does not pretend unlike scales are
numerically equivalent. The table can be filtered by canonical item name and
source subset, reports source coverage per item, and currently shows at most 200
matching items.

## Editorial compromise

The editorial v1 format handles tier sets only. The comparison UI does not
compute per-scale summaries because unlike verbal scales do not have an honest
shared numeric meaning. Before stable release, `schemaVersion: 1` may be
replaced rather than migrated; there is no pre-release compatibility promise.

## Discovery format

Discovery YAML is a separate format because factual entities and relationships
have different validation and review needs from editorial rankings. It defines
cited quests, mechanics, secrets, enemies, bosses or nodes under stable local
keys, then joins them with typed `requires`, `unlocks`, `occurs-at`, `involves`,
`rewards` or `connects-to` relationships. A relationship endpoint may be a local key or an
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
provide a name, slug, description, aliases, or the explicit tombstone
`retired: true`; `retired: false` is rejected because restoration needs a
separate reviewed operation. See `data/manual/facts.example.yaml`.

Import the target provider first, then the overlay:

```sh
pnpm data:refresh wfcd-items
pnpm data:refresh manual-facts:data/manual/facts.example.yaml
```

Source priority determines the active value for name, slug, and description.
The default manual priority is 300, above the bundled providers, while each
field retains the overlay's source record, YAML path, snapshot, and citation.
Later provider refreshes therefore cannot silently erase an accepted
correction. Aliases supplement identity matching rather than replacing a
canonical field.

An unresolved target, mismatched entity kind, or unregistered target source is
recorded as an ingestion conflict. It is never redirected by a similar display
name. Manual sources remain explicit operator imports—by CLI or administrator
upload—and are not scheduled by the background worker.
