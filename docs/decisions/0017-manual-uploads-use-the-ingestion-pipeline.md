# ADR 0017: Route manual uploads through the ingestion pipeline

## Decision

Administrators may upload ranking, discovery or factual-overlay YAML from the
data-source screen. The server accepts at most 1 MB, copies the uploaded bytes
into the chosen manual adapter, validates its embedded source metadata, archives
the immutable snapshot and promotes observations using the same path as the CLI.

Uploaded filenames are used only for extension validation. The application does
not accept a client-provided filesystem path. Automatic provider source IDs are
reserved and cannot be replaced by a manual document.

## Rationale

Manual evidence is a first-class source but requiring container shell access
makes routine editorial updates unnecessarily operational. A second import path
that writes catalog rows directly would bypass provenance, conflicts, source
priority and release composition. Reusing adapters preserves one trust boundary.

## Consequences

- CLI imports remain available for automation and local authoring.
- Browser uploads are synchronous and deliberately small. Preview now executes
  the same promotion transaction and rolls it back; import remains a separate
  submission that revalidates and archives the selected bytes. A future durable
  approval workflow can stage those bytes without changing adapter semantics.
- Validation or promotion failure is recorded as a failed source refresh when
  source metadata was valid enough to construct the adapter.
- Manual sources are explicit actions and are never placed on the recurring
  worker schedule.
