# ADR 0003: No pre-release compatibility burden

Status: accepted

Until a stable release stores real user data, schemas, APIs, routes and fixtures
may be deleted or replaced rather than migrated. Tests target the current model,
not obsolete formats. Before the first stable release, this decision must be
replaced by an explicit migration and support policy.
