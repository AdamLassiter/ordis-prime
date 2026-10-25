# 0063: Quest sequence is not access evidence

Status: accepted

## Context

Progression contains quest identities from WFCD, but it lacks a
source-owned quest sequence and does not consistently have the Codex
description. The WARFRAME Wiki's versioned
[`Module:Keys/data`](https://wiki.warframe.com/w/Module:Keys/data) distinguishes
main quests, optional quests and mission keys. Its `PreviousQuest` field is
documented as the previous quest in a sequence, not as a complete statement of
gameplay prerequisites.

Mapping sequence directly to `requires` would make the acquisition planner
claim access rules the source does not assert. Importing mission keys as quests
would also blur two different concepts.

## Decision

Add an independent `warframe-wiki-quests` adapter that snapshots and parses the
literal `Module:Keys/data` Lua table without executing provider code. Import
records whose type ends in `Quest`, retain their in-game descriptions, and omit
`Mission` records.

Add a directed `follows` relation. A quest with `PreviousQuest = X` follows X.
Validate every referenced quest within the same snapshot and reject dangling,
cyclic, self-referential or duplicate-name records. Do not translate `PreviousQuest` or
`NextQuest` into `requires` or `unlocks`; access evidence remains a separate
fact with separate consequences.

## Consequences

- Quest pages and Progression cards can traverse the cited narrative sequence in both
  directions without affecting node-access calculations.
- The adoption-time live import composed 44 quest entities and 30 sequence
  links with WFCD without resolver conflicts.
- The adapter uses `PreviousQuest` as the sequence edge authority; the
  partially populated reciprocal `NextQuest` field is not needed.
- Mission keys remain outside the discovery quest catalog.
- Actual quest prerequisites, stages, branch conditions and rewards remain
  future sourced models rather than implications inferred from ordering.
