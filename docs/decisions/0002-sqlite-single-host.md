# ADR 0002: SQLite and one deployment host

Status: accepted

The supported deployment is one Compose project and one mounted data volume.
SQLite uses WAL, foreign keys and a busy timeout. The web server and background
worker are separate containers on the same host; database leases serialize job
claims and allow either process to restart independently.

Schema migration is serialized with a short-lived lock file adjacent to the
database. This is necessary because the web and worker containers can initialize
the shared database concurrently.
