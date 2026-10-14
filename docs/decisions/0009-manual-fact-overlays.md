# ADR 0009: Apply manual facts as cited source overlays

Status: accepted

Provider records sometimes need corrections or application-specific enrichment,
but editing imported rows would destroy provenance and be overwritten at the
next refresh.

Manual facts are therefore independent, immutable source snapshots. Every
entry targets an explicit provider external ID and supplies only the fields it
asserts. Source priority selects the active field value while field-level
provenance preserves both the winning overlay and the underlying provider
observations. Display-name matching is forbidden for overlays.

The target provider must be imported first. Missing targets, unknown target
sources, and kind disagreements become reviewable ingestion conflicts rather
than new guessed identities. Retirement is an explicit one-way tombstone in
this format; restoring a retired entity requires a future reviewed operation.

This adds an operator-managed priority policy and requires corrections to be
versioned as files, but makes them auditable, reversible by source replacement,
and resistant to routine provider refreshes.
