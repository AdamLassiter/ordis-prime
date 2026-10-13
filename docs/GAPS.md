# Known gaps and compromises

This is a living record of where the implementation differs from the intended
architecture. A feature appearing in the roadmap is not evidence that it exists.

## Current

- The workspace installs from a frozen lockfile and has been verified with its
  type checks, tests, production build, SQLite migration, and production
  container smoke test. GitHub Actions runs those build gates, but the workflow
  has not yet been observed on the remote repository.
- The canonical schema, initial migration, and transactional per-source
  promotion exist. Cross-source full-catalog candidate releases, pruning of
  superseded relation rows, and the SQLite job runner are not implemented yet.
  Migrations run lazily when the web process first opens SQLite.
- WFCD item and mission-drop adapters exist and emit entities, recipes,
  components, nodes, and drops. Fetched payloads can be retained in an
  immutable, hash-verified snapshot store and observations can be resolved into
  canonical SQLite records with provenance and reviewable conflicts through a
  provider-neutral refresh command. Validated, cited manual ranking YAML uses
  this same path. Refresh attempts and failures are persisted without replacing
  active data. Administrators can inspect recent attempts, bounded failure
  messages, retained snapshot paths, and record-level resolver conflicts. Manual
  fact corrections, scheduled static-catalog refresh jobs, and conflict
  resolution actions remain to be implemented. A provider-neutral world-state
  pipeline snapshots and transactionally promotes WFCD cycles, events, alerts,
  fissures and traders.
  A public timer view exposes active and upcoming windows with client-updating
  countdowns and visible snapshot freshness. A database-leased production worker
  polls it every five minutes and retries failures without replacing active data.
  Snapshots older than a configurable threshold are visibly marked stale without
  hiding their data. Job-history pruning and canonical node reconciliation remain.
- The web explorer reads the canonical SQLite catalog and links active recipes,
  drops, nodes, record-level provenance, and editorial rankings. Newly imported
  entity fields and typed relations retain exact source record keys, paths, and
  citations when supplied. Older pre-provenance relation rows display without
  those optional details. Docker deployments do not yet expose an administrative
  refresh trigger, so their first-run catalog is empty until ingestion is run
  against the mounted data directory.
- Local email/password accounts, persisted sessions, closed registration, and
  first-administrator bootstrap enforcement are wired at the authentication
  API, with first-run, sign-in, and sign-out UI. Account administration,
  password recovery, and authorization checks on player-state mutations are not
  implemented yet.
- Validated inventory persistence, authenticated catalog editing, an inventory
  summary, node reward ownership filtering, and portable profile import/export
  with transfer UI exist. Authenticated goals feed a planner that subtracts
  inventory, expands active recipes, lists missing requirements, and links to
  candidate nodes with visible reasons. Planning does not yet account for node
  access, alternative recipes, markets, relic refinement, or mission duration.
- Authenticated players can keep private static todos with optional notes and due
  dates. Source-neutral world-state watches match current window fields and
  create deduplicated private in-app alerts. Todos and watches are not yet
  portable or linked to canonical entities; todos cannot recur, watches cannot
  be edited or paused, and there are no web-push or webhook delivery channels.
- Private, revisioned build persistence supports partial equipment loadouts,
  positioned mods, notes and immutable unlisted share snapshots. Authenticated
  editor and public snapshot routes use canonical catalog links. Advanced
  configuration fields, profile portability, cloning, share-history management
  and revocation remain to be implemented.
- Active cited editorial ranking sets have a public source-and-item comparison
  matrix that preserves unlike scales and disagreement. Source subset controls
  and transparent derived summaries are not implemented.
- WFCD item and drop observations compose planet, mission and level metadata in
  a public planet-grouped star-chart explorer with a player-needed overlay. The
  imported sources do not provide connection edges or coordinates, so it is not
  yet an interactive graph. Quest prerequisites, mechanics, secrets and richer
  enemy/boss facts still need typed discovery relations.
- A public discovery atlas searches canonical quest, enemy, boss, mechanic and
  secret kinds. WFCD currently populates quests and enemies; prerequisites,
  progress, richer boss classification, manual mechanics/secrets and typed links
  to nodes or rewards remain.

## Deliberate compromises

- Wiki pages are external detail links in v1; automated wiki ingestion is not a
  dependency of the catalog.
- Recommendations explain goal coverage and documented chance but do not claim
  time efficiency without reliable mission-duration data.
- SQLite and one application instance are the deployment target. PostgreSQL and
  multi-instance coordination are not designed until demonstrated necessary.
- English canonical names come first; source identifiers and aliases preserve a
  route to later localization.
