# ADR 0002: SQLite and one container

Status: accepted

The supported deployment is one self-contained Docker image and one mounted
data volume. SQLite uses WAL, foreign keys and a busy timeout. Background work
uses database leases so it can later move to another process without requiring
that complexity now.
