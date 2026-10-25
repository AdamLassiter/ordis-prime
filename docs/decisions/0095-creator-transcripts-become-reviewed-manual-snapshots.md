# 0095: Creator transcripts become reviewed manual snapshots

## Context

Automatic transcripts contain near-homophones such as “Kota” for Coda and
“Spirit” for Spira. Importing display text directly would create phantom items
or silently attach an opinion to the wrong weapon. Two supplied files also have
different filenames but the same video and byte-identical transcript body after
the URL line.

## Decision

Convert each unique video into a normal manual-ranking YAML source. Resolve
every subject to an exact WFCD `uniqueName`, retain the creator's declared scale
and publication metadata, and record qualifications such as Incarnon form,
platform, firing mode or speculative placement in entry notes.

Maintain a structured conversion index containing every input path, hash,
output and status. Record the mislabeled duplicate as a duplicate of the
Brozime source instead of creating a second ranking set. Creator rankings remain
explicit operator imports and are never scheduled or refreshed automatically.

## Consequences

- Tier Lists can compare creator opinions with community snapshots without
  conflating their provenance.
- Transcript errors cannot create identities through fuzzy name matching.
- Updating a creator snapshot is a deliberate human review task.
- The conversion index and tests make omissions, changed source files and
  duplicate-source inflation visible.
