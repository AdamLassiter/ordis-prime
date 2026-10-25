# Todos from Human Inspection

For an example of the account data currently available to import, inspect
`data/ordis-prime-with-acct-data.sqlite`. Treat it as diagnostic example data,
not an authoritative fixture: some queued synchronization work was incomplete
when the database was captured.

Once completed, git commits should be written for each todo item.

- [x] Operator > Collection layout now applies shared card or compact-row presentation to Codex, Progression, Star Chart, Cycles, Alerts, and Tier Lists, while purpose-built maps, forms, graphs, and semantic tables retain their native layouts
- [x] Operator > Saving interface preferences now reloads the persisted values and confirms the save instead of restoring stale dropdown defaults
- [x] Codex > Lede now uses the same shared typography as other page ledes
- [x] Codex > Repeated card grids, including Catalog records, Progression, and Star Chart nodes, now use at most four responsive columns instead of producing seven narrow cards
- [x] Search fields now expand through available filter width in Progression, Inventory, Tier Lists, and Market, matching the full-width Codex search behavior
- [x] Updated interface language to match current direct naming: Codex launch cards use Star Chart, Cycles, Builds, and Progression; Alerts uses Alarms; the Builds tab and page replace Arsenal; and the share action is simply Publish
- [x] Progression > Removed the redundant Kind dropdown; the lozenges are the sole kind selector and search submissions preserve the selected lozenge
- [x] Codex > Query the Codex now sits below the four launch cards and immediately above catalog filters and results
- [x] Catalog records now reports the authoritative matching total and provides bounded Previous/Next paging that preserves the query and kind filter
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
