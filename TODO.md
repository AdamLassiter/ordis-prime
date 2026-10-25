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
- [x] Builds > Publish now redirects to the read-only version with explicit confirmation, and the public Builds workspace provides searchable, paginated browsing of every published version
- [x] Market > Relics / Syndicate mods / Arcanes now reuses the Star Chart view-tab styling and accessible current-page state
- [x] Market price coverage and refresh time now appear as one quiet explanatory sentence above the view tabs instead of a prominent status panel
- [x] Planner > Still required is now a responsive semantic table with item, type, quantity, and collection-state columns
- [x] Planner > Nokko bounty candidates now retain their exact bounty/rotation labels while linking to the canonical Deepmines node; Nightcap names the three Deepmines bounties and links to the activity without creating synthetic Star Chart nodes for reward rotations
- [x] Codex > Vendor locations now appear as a dedicated, linked, cited Location fact above generic relationships; Daughter has a sourced Necralisk mapping and the presentation applies to every vendor with an `occurs-at` node relation
- [ ] For simplicity, there should be options for marking all progression complete, or at least a bulk multi-select in table view
  - There should simlilarly be bulk actions for marking the whole star chart as visited (in normal difficulty and steel path difficulty separately), as well as marking a whole planet/area as visited
- [ ] Codex > <somethjng> has a lot of vertical layout space taken up bu Todo, World-state watch, Inventory etc. - some of these things could be tiles side-by-side or shown in a more compact manner.
