# 0056: Wiki schemas have independent adapters

Status: accepted

## Context

The Wiki's `Module:Warframes/data` contains nested, typed `Warframes` and
`Archwings` tables with literal maximum ranks. This is a different schema and
release unit from the horizontally partitioned weapon tables. The companion
module is also distinct, but currently has no maximum-rank field.

Putting every Wiki module behind one source ID would make an unrelated schema
breakage withdraw all Wiki enrichment together. Duplicating MediaWiki and Lua
handling in each adapter would make trust-boundary fixes inconsistent.

## Decision

Keep one automatic source adapter per upstream schema and share only the
MediaWiki revision acquisition, immutable versioning, non-executing Lua parsing,
literal access, Unicode decoding and revision-citation primitives.

Add `warframe-wiki-warframes` for the `Warframes` and `Archwings` tables. Require
each group to exist and contain ranked records, require its literal `Type` to
match the expected canonical kind, accept integer maximum ranks from 30 through
40, and skip records explicitly marked `_IgnoreEntry`. Keep it lower priority
than WFCD and give it the same 50 percent shrinkage guard.

Do not add a companion adapter until its upstream schema exposes a defensible
maximum rank or another cited source is selected. Absence is not evidence for a
default value.

## Consequences

- Weapon and Warframe schema failures are isolated source operations and cannot
  withdraw one another's facts.
- The worker refreshes both adapters independently and catalog releases record
  their exact active revisions.
- Current Wiki data adds rank facts for ordinary Warframes and Archwings while
  excluding placeholders, NPC forms and embedded forms flagged by the Wiki.
- New Wiki schemas still require source-specific validation and identity rules;
  the shared helper is not a generic observation mapper.
