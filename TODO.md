# Todos from Human Inspection

For an example of the account data currently available to import, inspect
`data/ordis-prime-with-acct-data.sqlite`. Treat it as diagnostic example data,
not an authoritative fixture: some queued synchronization work was incomplete
when the database was captured.

Complete each top-level item through cohesive, described commits. Check an item
off only after its acceptance criteria, relevant automated tests, and any
architecture or gap documentation updates are complete.

- [x] **Add an optional persistent system-tray mode to `ordis-prime-updater`.**

  The current updater performs one paired synchronization and exits. Add an
  explicitly enabled Windows tray mode that can wait for Warframe, synchronize
  without repeated user interaction, and remain understandable and revocable.

  - Offer opt-in launch at Windows sign-in; do not install background startup
    without an explicit choice.
  - While Warframe is absent, check for it once an hour. When it is first
    detected, synchronize immediately. While it remains available, synchronize
    no more than once an hour. Return to the waiting state after it exits.
  - Provide tray actions for **Sync now** and **Exit**, plus visible current
    state, last successful synchronization time, and the most recent bounded
    error. A transient failure must leave the process alive for a later retry.
  - Do not make the current ten-minute, single-use pairing secret permanent.
    Exchange a successful pairing for a separate device credential scoped only
    to inventory synchronization. Store only its hash on the server and keep
    the client secret in Windows Credential Manager rather than a file or log.
  - Add an Operator-page device list showing a human-readable device name,
    creation time, last-used time, and status. Revocation must take effect on
    the next request, and removing or deleting an account must revoke every
    device credential.
  - Preserve the existing rule that game credentials and raw inventory remain
    local or in-memory only. Apply rate limits, safe token rotation, replay
    protection, and bounded audit metadata without creating a general-purpose
    account API token.
  - This supersedes the strictly one-shot boundary in ADR 0109. Record the new
    security and lifecycle decision before considering the task complete.

  **Acceptance:** tray mode survives Warframe starting and stopping, performs
  the immediate/hourly schedule, exposes useful status without secrets,
  supports manual sync and clean exit, and stops synchronizing immediately
  after its device is revoked in the web UI.

- [x] **Make collection state immediately visible and consistent throughout the
      application.**

  Players should be able to scan a list, card, reward, or acquisition option and
  understand whether it is acquired, mastered, or still wanted without opening
  its detail page.

  - Derive **acquired** from a positive owned or built count. Keep owned and
    built quantities available where the distinction matters.
  - Treat a positive player-authored wanted count as explicitly wanted. For an
    item that can contribute mastery, also derive an implicit wanted state while
    mastery is not confirmed. A mastered but currently unowned item is not
    implicitly wanted. Non-mastery items are wanted only when explicitly
    recorded or required by another feature such as a goal.
  - Derived presentation must not write to or replace the player's explicit
    wanted count. Clearly distinguish explicit intent from a mastery-derived
    suggestion wherever both are editable.
  - Centralize these semantic states so the catalog, entity details, node
    rewards, planner, Circuit schedules, and Index use the same rules. Rendering
    may differ by context: cards can use badges, tables can use compact columns,
    and relic analysis can highlight owned relics and missing rewards.
  - Use text or icons as well as colour. Do not rely on strikethrough or colour
    alone, and preserve readable contrast, focus states, and screen-reader
    labels.
  - Add relevant filters and sorting, such as acquired, unowned, mastered,
    unmastered, explicitly wanted, and implicitly wanted.

  **Acceptance:** the same item produces the same semantic collection states on
  every player-aware page; mastered-but-unowned equipment is not shown as
  wanted by default; and all states remain understandable without colour.

- [x] **Expand `/inventory` into a complete collection and mastery workspace.**

  An inventory page already exists, but it currently lists only entities with a
  persisted `player_inventory` row. Expand it so players can browse recorded and
  missing collection items together instead of discovering gaps through the
  public catalog one item at a time.

  - Join collection-relevant catalog entities to private inventory state and
    show explicit zero/unknown state for entries without a player row. Exclude
    non-collection concepts such as nodes, quests, abilities, enemies, and
    vendors from the default collection view.
  - Add search, entity-kind and collection-state filters, sortable columns, and
    card/table layouts. Show owned, built, wanted, mastered, and subsumed values
    where applicable, with direct navigation to the item and a practical way to
    edit its private state.
  - Include useful totals by category without treating a resource stack, mod
    rank, equipment copy, and mastery completion as interchangeable measures.
  - Treat crafting resources/components, Credits, Platinum, modular equipment,
    and Incarnon adapters/evolutions as separate modeling work. Import or display
    each only after its source field, identity, privacy, and reconciliation
    semantics are documented; do not force them into an inaccurate generic
    owned-count row.
  - Add a mastery helper once mastery eligibility and XP values are sourced. It
    should separate confirmed mastered items, confirmed unmastered items,
    unknown state, completed XP, and remaining available XP rather than
    presenting an unjustified exact rank forecast.
  - For missing items, join the existing acquisition graph to show recipes,
    missions, rotations, vendors, and current market context. Market suggestions
    must respect tradeability and distinguish a platinum shortcut from normal
    acquisition rather than labeling the cheapest listing as universally best.

  **Acceptance:** a player can answer “what do I own?”, “what can still provide
  mastery?”, and “where can I obtain a selected missing item?” from the
  inventory workspace, with unknown or unsupported data shown honestly.

- [x] **Replace ambiguous label-only links with typed identity resolution.**

  The missing Circuit link for Chroma is not evidence of a duplicate database
  row. The catalog legitimately contains both an enemy named Chroma and the
  Chroma Warframe. The Circuit adapter currently supplies only the display
  label, so promotion refuses to choose between the two and leaves the reward
  unlinked.

  - Let source observations provide an expected entity kind or stable external
    identifier when their context establishes one. Normal Circuit primary
    rewards must resolve specifically to Warframes; other schedules and
    relations must declare their own supported subject kinds rather than inherit
    a global name preference.
  - Prefer exact external identifiers, then typed exact-name/alias resolution.
    If multiple candidates remain, preserve an unresolved subject and a
    reviewable conflict rather than guessing or deleting a legitimate entity.
  - Audit active cyclic rewards and other label-only relationships for the same
    failure mode. Make unresolved counts and source record context visible so
    future ambiguous names are discoverable during refresh review.
  - Version and refresh affected adapters so previously stored null links are
    rebuilt using the typed rule.

  **Acceptance:** Circuit Chroma links to `/catalog/warframe/chroma`; Codex
  search continues to show both the Warframe and enemy records; and genuinely
  ambiguous source contexts remain visibly unresolved instead of linking to an
  arbitrary match.

- [x] **Add portable player interface preferences to the Operator page.**

  Start with a deliberately small preference set that controls repeated
  presentation choices without creating page-specific settings for every view.

  - Support a preferred collection layout (`cards` or `table`), display density
    (`comfortable` or `compact`), and collection-state highlighting mode. Define
    the highlighting choices in terms of accessible badges/icons and emphasis,
    not colour names alone.
  - Preserve the current interface as the default for accounts without saved
    preferences. Apply preferences through shared list and collection-state
    components so pages do not independently reinterpret them.
  - Document which pages support both layouts. A page whose visual structure
    cannot sensibly become a table should retain its purpose-built view while
    still applying density and highlighting preferences where relevant.
  - Persist preferences per account, delete them with the account, and include
    them in profile export/import so they remain portable. Keep them separate
    from sourced catalog facts, game progression, and inventory evidence.
  - Respect operating-system reduced-motion and contrast needs regardless of a
    player's selected presentation preferences.

  **Acceptance:** changing a preference on the Operator page is reflected on
  every supported page, survives a new session and profile transfer, and never
  makes collection state dependent on colour alone.

- [ ] Remove all the <h1/> headers from pages, the highlighted tab and eyebrows/ledes should have sufficient context
