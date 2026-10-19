# 0055: Parse selected Wiki modules as data

Status: accepted; supersedes the no-automated-fetching part of ADR 0004

## Context

WFCD supplies stable catalog identities but its aggregate currently omits
equipment maximum rank. The WARFRAME Wiki maintains a documented,
horizontally-partitioned `Module:Weapons/data` table whose records include
`Name`, `Link`, `InternalName` and `MaxRank`. Article HTML and rendered wikitext
would be much less stable interfaces for the same fact.

Lua modules are executable source. Evaluating provider-controlled Lua inside an
ingestion worker would cross the source trust boundary, while matching nested
tables with regular expressions would silently accept malformed structure.

## Decision

Add an automatic `warframe-wiki-weapons` adapter that fetches the seven relevant
weapon-data partitions through MediaWiki's revisions API. Snapshot versions
contain every revision ID plus the local parser version. Parse the returned Lua
into a syntax tree without executing it, and accept only literal top-level
records with integer `MaxRank` values from 30 through 40.

Emit source-neutral weapon observations with record-level Wiki citations and CC
BY-NC-SA 3.0 attribution. Give the adapter lower priority than WFCD so its name
and slug cannot replace WFCD identity labels, while its otherwise-absent
maximum-rank assertion still composes normally. Explicit parenthesized weapon
modes may use their shared article link as an identity alias; ordinary variants
do not, because a Prime exalted weapon and its base article are distinct
canonical equipment.

Run the adapter daily and apply the same 50 percent retained-observation guard
as the WFCD catalog adapters. Any missing partition, MediaWiki error, invalid
JSON, unparsable Lua, or empty result fails the refresh and leaves the last
active run intact.

## Consequences

- Weapon build ranks gain broad sourced coverage without special build code.
- Raw Wiki responses remain immutable and replayable; parser changes produce a
  new source version even when upstream revisions do not change.
- The Lua parser is an ingestion dependency, but provider code is never run.
- The adapter is intentionally not a general-purpose Wiki scraper. Other data
  modules require their own schema validation, identity rules and ADR updates.
- Maximum-rank coverage for Warframes, companions and Archwings remains a
  documented gap.
