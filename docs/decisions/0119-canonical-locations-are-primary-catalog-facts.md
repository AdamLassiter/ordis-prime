# 0119: Canonical locations are primary catalog facts

## Status

Accepted.

## Context

Catalog relationships preserve provenance and direction, but rendering a vendor
location only as an `occurs at` tag among dozens of offerings makes a basic
player question unnecessarily difficult to answer. The relation remains the
right storage model: duplicating a free-text location on the vendor would lose
the link to the canonical node and its citation.

## Decision

On a catalog detail page, promote outgoing `occurs-at` relations whose target is
a canonical node into a dedicated Location fact near the top of the record.
Keep its node link, explanatory notes, source, and citation. Remove that same
relation from the generic Related discoveries rendering so the page does not
repeat it; all other relations remain unchanged.

Add Daughter's independently cited Necralisk mapping to the vendor adapter as a
second covered location alongside Nightcap at Fortuna. This is evidence-backed
coverage, not a name-based location inference, and the generic presentation
will apply to every subsequently sourced vendor location.

## Consequences

- A vendor's location is visible before its potentially long offering list.
- Location remains one canonical relation rather than a denormalized display
  field.
- Vendors without a sourced node mapping do not display a guessed location.
- Further vendor coverage still requires capturing and reviewing the relevant
  Wiki page.
