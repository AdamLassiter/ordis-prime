# ADR 0002: SQLite and one container

Status: accepted

The supported deployment is one self-contained Docker image and one mounted
data volume. SQLite uses WAL, foreign keys and a busy timeout. Background work
uses database leases so it can later move to another process without requiring
that complexity now.

Schema migration is serialized with a short-lived lock file adjacent to the
database. This is necessary even in the single-container model because Next.js
build and server workers can initialize the database concurrently.
