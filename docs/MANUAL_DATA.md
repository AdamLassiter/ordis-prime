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
pnpm data:refresh manual:data/manual/editorial.example.yaml
```

The original YAML is stored as an immutable snapshot. Ranking sets and their
entries are versioned by source run, so different authors and dates remain
independently queryable rather than being collapsed into a consensus score.

## Current compromise

The v1 format handles editorial tier sets only. Curated factual corrections
need a separate explicit schema because corrections require field-level
precedence and review semantics. Before stable release, `schemaVersion: 1` may
be replaced rather than migrated; there is no pre-release compatibility
promise.
