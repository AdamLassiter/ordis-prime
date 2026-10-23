# Todos from Human Inspection

These TODO items should be fixed, with written commits as progress is made:

- [x] Search controls are poor and inconsistent.
  - Multiple-search forms (such as the Codex searching through all items and the intent being showing multiple results) should have a textbox and search button
  - Single-search forms (such as picking an item in the arsenal builds) should be a single textbox with debounce to show a list of options that match the search query
- [x] Editable field controls are poor and inconsistent.
  - Changes to e.g. a build in the arsenal should be saved by default
  - User-defined fields such as the build title and category should be editable in-line
- [x] Some layout doesn't take advantage of removing the max-1280px main width and could be reorganised
  - Lots of things are just grid rows stretching vertically downwards, not making efficient use of horizontal space
- [ ] Editing the star chart layout should more easily allow rescaling the circles for planets and nodes
  - Picking the 'exact catalog label or slug' should be from a fixed list of known entities in this part of the star chart
  - Imported screenshots should be shown at full-width, the math is off for circle radii with regards to padding around the image
  - The star chart will actually need one level of heirarchy higher than zoomed-out-planet, but would be fine to implement as just various tabs
    - Origin System
      - Planets
      - Hollvania (doesn't look like a planet, but has the same structure of nodes within, so can probabv just be treated as such)
    - Railjack
      - Planetary orbits (X proxima, usually)
    - Sanctuary / Dark Refactory / Duviri
      - Some of these may need edges manuall added between nodes
- [ ] Language still needs improving
  - The emphasis highlighting on headings is inconsistent, not very helpful, and does not clearly indicate which tab is currently focussed
  - The language in ledes is a mix of appropriate, overly verbose, overly technical, or overly thematically-in-game
  - The language in eyebrows is stylistically pretty but functionally useless
    - it might be worth using this to indicate the 'scope' of the data on a given page though - private, shared, sourced data, admin, etc.
