# Voice and interface

Ordis Prime aims to feel like an intelligence console aboard the player's
Orbiter, not a generic database with Warframe labels applied to it. The product
should make a large, interdependent game legible while retaining the pleasure of
using an in-world instrument.

This is an original interface voice. It may evoke a diligent, occasionally
overenthusiastic Cephalon, but it must not reproduce dialogue from the game.

## Layers of language

Copy follows the player's context rather than forcing one tone everywhere.

1. **Player-facing navigation and guidance** is concise, confident and direct.
   Headings name the page or the task, while ledes explain what the player can
   do there. A small amount of Cephalon personality can make a secondary
   briefing memorable, but it does not replace operational language.
2. **Evidence and methodology** is exact and readable. Citations, provider
   identity, uncertainty, ranking methodology and access reasons must not be
   disguised by lore language. The surrounding explanation can be friendly,
   but the facts retain their source terminology.
3. **Administration and operations** is explicitly technical. Import previews,
   resolver conflicts, source runs, snapshots and worker failures are tools for
   operating the application. Atmosphere must never make those controls
   ambiguous.

Established Warframe names remain unchanged. A control can say “Open console,”
but it cannot rename a Fissure, Arcane, Relic refinement or other game concept
just to sound more fictional. Navigation labels should have enough supporting
context that a first-time visitor does not need to understand the metaphor.

## Visual language

- Void-dark surfaces provide the base; cyan identifies intelligence and live
  signals; restrained gold identifies intent, priority and primary actions.
- Angular cuts, fine grid lines and signal marks evoke an Orbiter display.
  Decoration should establish hierarchy rather than compete with dense data.
- Large headings communicate the player's decision. Dense records and tables
  use calmer panels beneath them.
- Motion is short and functional, and is removed when the operating system asks
  for reduced motion.
- Contrast, focus indicators, semantic HTML and explicit labels remain product
  requirements. Diegetic styling does not replace accessibility.

## Interface hierarchy

- The eyebrow above a page title states the scope of the data or access on that
  page: public sourced data, live data, private player data, shared snapshots or
  administrator access. It is not decorative flavour text.
- The active navigation state and scope eyebrow name the page or current
  record. A short lede describes the page's primary use in plain language.
- The current primary destination and the current local tab use visible active
  styling and `aria-current="page"`. Colour or heading emphasis must not be the
  only indication of location.
- Game terminology remains appropriate where it is the clearest label. Product
  and data-pipeline terminology is explained or confined to provenance and
  administration views.
- Ordis-style personality belongs in clearly secondary material such as the
  optional landing-page briefing. Actions, status, errors and empty states stay
  literal enough to scan quickly.

## Current compromise

The shared shell and application pages now use navigation, scope and lede
hierarchy consistently. Detail-heavy evidence views and administration screens
intentionally remain more technical. The landing-page briefing is a timed
overlay whose reading window scales with the message and whose motion respects
the operating-system preference. Visual refinements are still largely
CSS-native: there is no bespoke illustration or broader motion system, which
keeps the interface fast and accessible but limits its cinematic quality.
