# 0103: Page language exposes scope and location

## Context

The initial Cephalon-inspired interface used decorative eyebrow copy and
highlighted phrases inside headings. That created atmosphere but did not tell a
player whether a page contained public source data, private account state, a
shared snapshot or administrator controls. Heading emphasis was inconsistent
and could be mistaken for the current navigation state. Ledes also mixed direct
guidance with data-pipeline terminology and in-game metaphor.

## Decision

Every primary page uses three distinct language roles:

1. The eyebrow identifies data or access scope, using terms such as public,
   sourced, live, private, shared and administrator.
2. The `h1` names the page, task or current record without decorative fragment
   highlighting.
3. The lede gives a short, plain-language description of the page's use.

Primary navigation and local tabs indicate the current destination with both a
visible active style and `aria-current="page"`. Heading treatment is not used as
a location indicator.

Cephalon personality remains available for secondary, non-operational material
such as the landing-page briefing. Actions, errors, statuses, empty states,
evidence and administration copy remain literal and scannable.

## Consequences and gaps

- A player can distinguish source-backed data from their private state before
  reading the body of a page.
- Active navigation is available to assistive technology and does not depend on
  colour alone.
- New pages must choose an accurate scope instead of inventing atmospheric
  eyebrow copy.
- User-authored text and source-provided descriptions are displayed faithfully;
  this decision governs application copy, not imported content.
