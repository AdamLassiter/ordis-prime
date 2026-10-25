# 0115: Briefings are timed overlays

## Status

Accepted.

## Context

The optional Ordis message occupied a permanent column in the landing-page
hero even though it was secondary flavour rather than a navigation or search
control. A fixed display gave short and long messages the same reading window,
and its signal bar did not communicate when the panel would clear.

## Decision

The landing-page briefing is a fixed overlay above the application content and
does not reserve layout space. Its reading window is calculated from the line's
word count, bounded between eight and sixteen seconds. A cyan bar drains over
the same interval, after which the panel slides beyond the right viewport edge.

The message remains in the document after its visual dismissal so assistive
technology is not forced to race the timer. When reduced motion is requested,
the JavaScript timer still preserves the reading window while CSS removes the
animated countdown and slide.

## Consequences

- Search and catalog content can use the full hero width while the briefing is
  present.
- Longer lines receive more time without allowing the flavour panel to linger
  indefinitely.
- The overlay is deliberately non-interactive and ignores pointer input so it
  cannot block controls beneath it.
- There is currently no manual reopen or dismiss control; the briefing is an
  ephemeral landing-page message rather than persistent content.
