# 0121: Detail account tools use a responsive grid

## Status

Accepted.

## Context

Catalog and node records combine extensive public facts with several small
private actions. Rendering discovery or node progress, Todo, world-state watch,
inventory, and acquisition goal as full-width cards in a vertical sequence made
the account controls longer than the sourced record and obscured their shared
purpose.

## Decision

Group private controls under one Your account section and lay their cards out in
an auto-fitting responsive grid. Cards retain their existing forms and server
actions; the change is presentation and information hierarchy, not state
ownership. At narrow widths the grid collapses naturally to one column.

Move collection-state indicators into the inventory card so status and editing
remain one unit. Apply the same account grid to canonical node pages for node
completion, Todo, and world-state watch controls.

## Consequences

- Related private actions are visible side by side on wide screens without
  consuming a full row each.
- Inventory status no longer occupies a separate unlabelled strip.
- Forms remain individually submitted and authenticated, so compact layout does
  not couple unrelated writes.
- Particularly tall forms may produce uneven card heights; masonry packing is
  deliberately avoided to preserve predictable reading order.
