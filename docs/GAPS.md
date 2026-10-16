# Known gaps and compromises

This is a living record of where the implementation differs from the intended
architecture. A feature appearing in the roadmap is not evidence that it exists.

## Current

- The workspace installs from a frozen lockfile and has been verified with its
  type checks, tests, production build, SQLite migration, and production
  container smoke test. GitHub Actions runs those build gates, but the workflow
  has not yet been observed on the remote repository.
- The canonical schema, initial migration, and transactional per-source
  promotion exist. Each release now records its complete active source-run
  composition. Snapshot-evidence coherence, whole-candidate identity,
  singleton-fact and ranking invariants run before a source is staged. The
  composed candidate also rejects active
  facts that would reference a retired entity, use non-node entities in
  node-only positions, attach enhancement options to non-shards, or introduce
  a cycle through active recipe alternatives. Broader cross-source semantic
  completeness checks remain unimplemented. Automatic WFCD catalog adapters reject
  candidates below half their preceding observation count, but this coarse guard
  does not detect selective omissions or semantically implausible changes above
  that floor. The worker retains a configurable number of inactive
  catalog releases and removes unreferenced clean source runs and their facts;
  runs containing resolver conflicts remain protected for review. Refresh-operation
  rows are bounded per source. Raw content-addressed payloads without any retained
  database reference are collected after a configurable safety grace. A
  SQLite-leased job runner handles recurring work. Migrations run lazily when
  the web process first opens SQLite. Canonical entity fields are recomputed
  from value-bearing provenance whenever active source membership changes, so
  priority fallback, exact-tie selection and withdrawal are deterministic across
  import order. Name and slug are still
  retained as identity labels when no active source asserts them; arbitrary
  typed field schemas and per-field merge policies are not yet modeled. Older
  provenance rows have no reconstructable asserted value and retain their
  canonical field until their source is refreshed.
- WFCD item and mission-drop adapters exist and emit entities, recipes,
  components, arcanes, Archon Shards, nodes, and drops. Fetched payloads can be retained in an
  immutable, hash-verified snapshot store and observations can be resolved into
  canonical SQLite records with provenance and reviewable conflicts through a
  provider-neutral refresh command. Validated, cited manual ranking and factual
  overlay YAML use this same path. Refresh attempts and failures are persisted
  without replacing active data. Administrators can inspect recent attempts,
  bounded failure messages, retained snapshot paths, and record-level resolver
  conflicts. Administrators can review or reopen conflicts with an append-only
  audit trail. Ordinary review state does not mutate catalog identity. For
  ambiguous entity identities, administrators can instead bind an exact
  conflicting external ID to an offered canonical candidate. These overrides
  are reversible and audited; their revision causes unchanged source bytes to
  promote as a new run so skipped observations can replay. Automatic sources
  are queued immediately, while manual sources require re-upload.
  The leased worker schedules WFCD item and drop refreshes daily, and an
  administrator can bring supported source jobs forward from the source UI. A provider-neutral world-state
  pipeline snapshots and transactionally promotes WFCD cycles, events, alerts,
  fissures and traders. A provider response older than the active observation
  time is rejected rather than rewinding live state.
  A public timer view exposes active and upcoming windows with client-updating
  countdowns and visible snapshot freshness. A database-leased production worker
  polls it every five minutes and retries failures without replacing active data.
  Snapshots older than a configurable threshold are visibly marked stale without
  hiding their data. Normalized world-state history and unreferenced raw payload
  storage are bounded independently. Exact unique node names and catalog aliases
  are reconciled to canonical nodes; ambiguous or differently spelled labels
  remain plain source text. Finished
  job history is count-bounded and filterable by kind, status and source.
  Source operation pages report persisted record counts, durations and aggregate
  throughput. Attempts stranded by a terminated process are failed after the
  worker's maximum lease, so they do not remain permanent retention roots;
  provider spellings absent from catalog aliases remain unresolved.
- The web explorer reads the canonical SQLite catalog and links active recipes,
  drops, nodes, record-level provenance, and editorial rankings. Newly imported
  entity fields and typed relations retain exact source record keys, paths, and
  citations when supplied. Older pre-provenance relation rows display without
  those optional details. Docker deployments queue initial catalog imports in
  the worker and expose administrator-only refresh controls. Administrators can
  upload bounded ranking, discovery or factual-overlay YAML through the same
  snapshot/promotion pipeline. A dry run executes and rolls back the same
  resolver/promotion transaction before the separately confirmed import.
  Manual uploads still run synchronously in the web request.
- Local email/password accounts, persisted sessions, closed registration, and
  first-administrator bootstrap enforcement are wired at the authentication
  API, with first-run, sign-in, and sign-out UI. Player-state reads and mutations
  are scoped by the authenticated user in database queries. Administrators can
  list local accounts and safely change roles with session invalidation.
  Players can transactionally delete their own account and revoke its public
  build shares, with final-administrator protection and retained audit labels.
  Deletion requires the current local password and an exact confirmation
  phrase. Password recovery is not implemented yet.
- Validated inventory persistence, authenticated catalog editing, an inventory
  summary, node reward ownership filtering, and portable profile import/export
  with transfer UI exist. Authenticated goals feed a planner that subtracts
  inventory, expands active recipes, lists missing requirements, and links to
  candidate nodes with visible reasons. Profiles include inventory, goals,
  discovery progress, static todos, watch rules and private build drafts.
  Generated alerts and published share snapshots are deliberately excluded.
  Live windows on reconciled recommended nodes surface as expiring acquisition
  opportunities. Players can inspect and persist alternative recipe choices by
  stable source record identity. Profiles also carry the player's optional
  Mastery Rank as private progression input. Planning composes cited discovery prerequisites
  into available, conditional, blocked and unknown node access states. Sourced
  numeric Mastery Rank gates compose with a private portable player rank, but
  other conditional gates, markets, relic refinement, and mission duration are
  not yet modeled.
- Authenticated players can keep private static todos with optional notes and due
  dates. Source-neutral world-state watches match current window fields and
  create deduplicated private in-app alerts. Detail pages can create todos and
  world-state watches linked to one canonical item, discovery topic or node.
  Node and item watches match exact reconciled canonical identity. World-state
  subjects currently cover WFCD alert rewards, event names/rewards, and trader
  inventory; unexposed or ambiguous subjects remain unmatched. Todos
  support fixed-day, weekly, monthly-date, monthly-weekday and yearly calendar
  recurrence while remaining date-only; there are no web-push or webhook delivery channels. Watches
  can be edited, paused and resumed without losing generated alerts.
  Read, expired alerts have configurable time-based retention; unread and
  non-expiring alert history is deliberately not pruned automatically.
- Private, revisioned build persistence supports partial equipment loadouts,
  positioned mods, mod and equipment ranks, configuration labels, Forma counts,
  capacity-upgrade flags, notes and immutable unlisted share snapshots.
  Authenticated editor and public snapshot routes use canonical catalog links. Sourced mod
  maximum-rank, base-drain and polarity facts validate selected ranks and expose
  per-mod unpolarized drain. Player-authored mod-slot roles and polarities are
  preserved independently of installed mods and drive a derived adjusted drain
  or capacity bonus at matching positions. Sourced factory slot layouts,
  comprehensive item-specific maximum ranks and whole-build capacity calculation remain. Builds can assign
  ranked arcanes and positioned Archon Shards with sourced effect selections.
  Arcane candidates and assignments enforce sourced broad and specialized weapon classes against
  equipped items in either assignment order. Equipment slots also enforce
  sourced weapon classes. Kitgun chambers and Zaw strikes act as the current
  modular weapon representatives; full part composition is not modeled. Private
  drafts are
  portable and can be cloned; their snapshot history can be viewed or revoked.
  Authenticated recipients can clone a public snapshot into a private draft.
  Draft equipment and mods can seed missing-item acquisition goals, but the
  planner does not yet understand build capacity, alternative mod ranks or
  configuration-specific requirements.
- Active cited editorial ranking sets have a public source-and-item comparison
  matrix with source-subset controls and coverage counts that preserve unlike
  scales and disagreement. An opt-in derived ordinal summary exposes its exact
  scale-position median and range method beside the raw tiers. It deliberately
  does not model source authority, recency, scope alignment or patch relevance.
- WFCD item and drop observations compose planet, mission and level metadata in
  a public planet-grouped star-chart explorer with a player-needed overlay. The
  imported WFCD sources do not provide connection edges or coordinates, so it is
  not yet an interactive graph. Cited `connects-to` observations are supported
  and shown symmetrically when another source supplies them, but a complete
  attributed edge dataset and stable positions are still missing.
- A public discovery atlas searches canonical quest, enemy, boss, mechanic and
  secret kinds. WFCD currently populates quests and enemies; cited discovery
  YAML can add curated entities and typed links to nodes, rewards, or other
  topics. Players can privately mark topics unseen, discovered, or completed
  and filter the atlas by that state. Richer boss classification, quest-step
  progress and conditional relations remain. Atlas cards preview up to three
  cited neighbors; a spatial graph view remains.
- Acquisition recommendations compose active `requires` and `unlocks` relations
  with private discovery completion and sourced node Mastery Rank requirements
  to show cited blockers. Nodes without access evidence stay unknown. Junction
  conditions and other conditional access rules still need typed models.

## Deliberate compromises

- Wiki pages are external detail links in v1; automated wiki ingestion is not a
  dependency of the catalog.
- Recommendations explain goal coverage and documented chance but do not claim
  time efficiency without reliable mission-duration data.
- SQLite and one application instance are the deployment target. PostgreSQL and
  multi-instance coordination are not designed until demonstrated necessary.
- English canonical names come first; source identifiers and aliases preserve a
  route to later localization.
