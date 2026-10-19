# 0057: Exact-kind aliases outrank unknown placeholders

Status: accepted

## Context

Provider catalogs can contain unrelated records with the same display name.
For example, WFCD currently contains both the Warframe Jade and an unknown-kind
Jade colour-picker record. A typed Wiki observation for the Warframe therefore
found one exact-kind alias and one unknown placeholder and was reported as
ambiguous.

Unknown entities must remain refinable when they are the only candidate, but an
unknown placeholder should not make an otherwise unique exact-kind match
ambiguous.

## Decision

Stable external identifiers continue to take precedence over aliases. During
alias resolution for a typed observation, prefer candidates whose canonical
kind exactly matches the observation when at least one exists. Consider unknown
candidates only when there is no exact-kind candidate.

Two or more exact-kind candidates remain a conflict. An unknown-kind
observation continues to match only unknown candidates, so weak evidence cannot
attach itself to a typed entity.

## Consequences

- Typed sources compose through ordinary names despite unrelated unclassified
  catalog debris.
- A unique unknown record can still be refined by later typed evidence.
- Genuine same-kind ambiguity remains visible for operator review rather than
  being resolved by insertion order.
