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

The original YAML is stored as an immutable snapshot. Ranking sets and their
entries are versioned by source run, so different authors and dates remain
independently queryable rather than being collapsed into a consensus score.

The public `/rankings` view shows each active source's declared scale, scope,
game version and citation beside a matrix of its entries. Values remain verbatim
and blank cells remain blank; the application does not pretend unlike scales are
numerically equivalent. The table can be filtered by canonical item name and
currently shows at most 200 matching items.

## Current compromise

The editorial v1 format handles tier sets only. The comparison UI does not yet
select subsets of sources or compute transparent per-scale summaries. Curated factual corrections
need a separate explicit schema because corrections require field-level
precedence and review semantics. Before stable release, `schemaVersion: 1` may
be replaced rather than migrated; there is no pre-release compatibility
promise.

## Discovery format

Discovery YAML is a separate format because factual entities and relationships
have different validation and review needs from editorial rankings. It defines
cited quests, mechanics, secrets, enemies, bosses or nodes under stable local
keys, then joins them with typed `requires`, `unlocks`, `occurs-at`, `involves`
or `rewards` relationships. A relationship endpoint may be a local key or an
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

The current format cannot override individual fields from another source or
express conditional relationships. Those require explicit semantics rather
than overloading free-form notes.
