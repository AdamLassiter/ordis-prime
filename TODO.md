# Todos from Human Inspection

For an example of the account data currently available to import, inspect
`data/ordis-prime-with-acct-data.sqlite`. Treat it as diagnostic example data,
not an authoritative fixture: some queued synchronization work was incomplete
when the database was captured.

Once completed, git commits should be written for each todo item.

- [x] Operator > Collection layout now applies shared card or compact-row presentation to Codex, Progression, Star Chart, Cycles, Alerts, and Tier Lists, while purpose-built maps, forms, graphs, and semantic tables retain their native layouts
- [x] Operator > Saving interface preferences now reloads the persisted values and confirms the save instead of restoring stale dropdown defaults
- [ ] Codex > Lede has a larger font size than other ledes
- [ ] Codex > Catalog records and Progression cards (possibly others?) have 7 cards per row - this is too narrow per card and should be more like 4 per row
- [ ] Codex > Search correctly stretches the input box across the full width of the screen, but Progression > Search does not (as well as a few others, e.g. Inventory search box)
- [ ] Lots of text and language could be revised to better fit amongst more recent language changes
  - Navigation / System Pulse / Arsenal / Archives cards on Codex should be updated
  - Alerts > Signal watches could probably just be 'Alarms'
  - Arsenal tab could probably be renamed Builds, and Publish Immutable Snapshot should probably just be Publish
- [ ] Progression > Kind dropdown for search is redundant given the lozenges below it to filter for discovery kind
- [ ] Codex > query the codex (search) should be below the four cards, above the catalog records results
- [ ] Catalog records incorrectly claims '100 records' for an empty search and has no paging controls
- [ ] Arsenal (or Builds) > <some build> > Publish doesn't give any confirmation or redirect to show it has been published
  - There's no way to browse all submitted builds, or search them etc.
- [ ] star chart uses a tabs bar to switch between origin / railjack / sanctuary/duviri - this is nice and the same style should be used for Market > Relics / Syndicate mods / Arcanes
- [ ] Market shows a count and updated time for prices - this should be just some simple text, maybe in the lede or maybe above the table, to describe this count and time.
- [ ] Planner > Still required uses <li/> with indentation - it should be a proper table
- [ ] Planner > candidate nodes > 'Nokko: Corporate Restructuring Rewards, Rotation B' doesn't link to anything - this suggests either the links here are broken, or more likely that there's a number of map nodes such as those in the deepmines that are missing (these only really come from vendor quests, they don't explicitly appear on the star chart)
  - Codex > Nightcap (vendor) doesn't list any of the nokko bounties as linked
- [ ] Codex > Daughter (or any other vendor) should show their location more obviously, rather than just an 'orccurs at' related discovery
- [ ] For simplicity, there should be options for marking all progression complete, or at least a bulk multi-select in table view
  - There should simlilarly be bulk actions for marking the whole star chart as visited (in normal difficulty and steel path difficulty separately), as well as marking a whole planet/area as visited
- [ ] Codex > <somethjng> has a lot of vertical layout space taken up bu Todo, World-state watch, Inventory etc. - some of these things could be tiles side-by-side or shown in a more compact manner.
