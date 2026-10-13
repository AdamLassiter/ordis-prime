# 0008: Typed, source-scoped discovery relations

Status: accepted

## Context

Discovery topics need to connect quests, mechanics, secrets, nodes, enemies and
rewards without embedding provider-specific IDs or unattributed prose in the UI.
A generic untyped link would be easy to ingest but could not answer player
questions such as “what unlocks this?” or “where does this occur?” reliably.

## Decision

Represent discovery links as directed observations with one of five initial
kinds: `requires`, `unlocks`, `occurs-at`, `involves`, or `rewards`. Resolve both
endpoints through the same external-ID identity layer as drops and recipes.
Persist the source run and record-level evidence on every link, and only expose
links belonging to active source runs.

Manual discovery files own stable local keys and may also point explicitly to
another source's external identifier. They cannot silently reference another
entity by display name.

## Consequences

- Replacing a source version atomically replaces its visible relationship set.
- Unresolved external endpoints become reviewable conflicts; invalid local keys
  fail before database promotion.
- Catalog pages can render links in either direction and retain attribution.
- Conditional edges, ordering, confidence and player progress remain separate
  future concepts rather than fields hidden in free-form notes.
