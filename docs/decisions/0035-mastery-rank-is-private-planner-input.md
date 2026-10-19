# 0035: Mastery Rank is private planner input

Status: superseded in part by ADR 0058

## Context

WFCD node details already supply numeric Mastery Rank requirements, but the
planner ignored them. Treating every documented node as available after quest
completion could therefore recommend a node the player cannot enter. Inferring
rank from mastered inventory would be incomplete and would turn the companion
into an unreliable Mastery calculator.

## Decision

Store an optional player-entered Mastery Rank in a separate private profile row.
The original representation accepted ranks zero through thirty and collapsed
Legendary progression to thirty; ADR 0058 replaces that bound with a combined
rank so the same private value can drive capacity. Include the value
in portable profile schema version 12 and clear it with replace-mode imports.

For each recommended node, select the highest-priority active sourced node
detail that declares a Mastery Rank requirement. Compare it with the private
rank and compose the result with cited discovery prerequisites. A known lower
rank blocks the node. A missing player rank produces an explicit `conditional`
access state. No requirement evidence still produces `unknown`.

## Consequences

- Planner access answers now include a common structured Warframe gate without
  pretending inventory ownership proves account progression.
- Rank and source evidence remain separate: the former is private player state,
  while the requirement stays a catalog fact with provenance.
- Profile schema 11 is intentionally rejected; pre-release compatibility is
  not required.
- Junction objectives, quest stages and other compound predicates need future
  typed condition models rather than overloading the numeric rank field.
