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
  this same path. Manual fact corrections, scheduled refresh jobs, persisted
  failure reporting, and live world state remain to be implemented.
- The web explorer reads the canonical SQLite catalog and links active recipes,
  drops, nodes, provenance, and editorial rankings. Docker deployments do not
  yet expose an administrative refresh trigger, so their first-run catalog is
  empty until ingestion is run against the mounted data directory.
- Local email/password accounts, persisted sessions, closed registration, and
  first-administrator bootstrap enforcement are wired at the authentication
  API, with first-run, sign-in, and sign-out UI. Account administration,
  password recovery, and authorization checks on player-state mutations are not
  implemented yet.
- Validated inventory persistence, authenticated catalog editing, an inventory
  summary, node reward ownership filtering, and portable profile import/export
  exist. Profile transfer UI and planner persistence are pending.
- The visual star chart, notifications, builds, editorial comparisons and
  discovery atlas are intentional later milestones.

## Deliberate compromises

- Wiki pages are external detail links in v1; automated wiki ingestion is not a
  dependency of the catalog.
- Recommendations explain goal coverage and documented chance but do not claim
  time efficiency without reliable mission-duration data.
- SQLite and one application instance are the deployment target. PostgreSQL and
  multi-instance coordination are not designed until demonstrated necessary.
- English canonical names come first; source identifiers and aliases preserve a
  route to later localization.
