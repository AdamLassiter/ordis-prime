# Known gaps and compromises

This is a living record of where the implementation differs from the intended
architecture. A feature appearing in the roadmap is not evidence that it exists.

## Current

- The workspace installs from a frozen lockfile and has been verified with its
  type checks, tests, production build, SQLite migration, and production
  container smoke test. Automated CI is not configured yet.
- The canonical schema and initial migration exist, but transactional
  staging/promotion and the SQLite job runner are not implemented yet. The web
  process does not yet run migrations at startup.
- WFCD item and mission-drop adapters exist and emit entities, recipes,
  components, nodes, and drops. Fetched payloads can be retained in an
  immutable, hash-verified snapshot store. Manual YAML, canonical persistence,
  refresh orchestration, and live world state remain to be implemented.
- The web explorer currently uses a small development catalog through the same
  query interface the SQLite repository will implement. It is not production
  data, and the health endpoint does not yet probe SQLite.
- Authentication tables are modeled, but local-account setup, sessions and
  authorization are not yet wired into routes.
- Inventory editing, profile import/export and planner persistence are pending.
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
