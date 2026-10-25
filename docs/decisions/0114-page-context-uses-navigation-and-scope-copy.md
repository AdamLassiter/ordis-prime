# 0114: Page context uses navigation and scope copy

## Status

Accepted.

## Context

Every application route repeated its name in a large page-level heading even
when the selected navigation tab, scope eyebrow, and introductory copy already
identified the workspace. These banners consumed vertical space without adding
new information. Removing them outright could, however, leave dynamic detail
routes without the name of the record being viewed.

## Decision

Application pages do not render a page-level `h1` banner. A route's selected
navigation state and its eyebrow or lede carry the page context instead. Static
route eyebrows explicitly name the workspace. Detail-route eyebrows also
include the current item, node, source, planet, or shared-build name so dynamic
identity remains visible.

Section headings retain their existing hierarchy and purpose. A source-level
regression test rejects page components that reintroduce an `h1` banner.

## Consequences

- Repeated page chrome is shorter and the primary controls or content appear
  sooner.
- Page identity remains visible without depending on colour or tab styling
  alone.
- Many route documents begin their content outline at `h2`. This is a deliberate
  semantic compromise and should be revisited if accessibility testing finds
  that navigation landmarks and descriptive scope copy are insufficient.
