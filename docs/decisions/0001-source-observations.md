# ADR 0001: Treat provider records as observations

Status: accepted

Provider schemas are not application schemas. Adapters emit observations with
evidence; a resolver creates canonical entities and typed relations. This costs
more than directly rendering WFCD JSON, but enables source composition,
conflicts, correction overlays, attribution and replacement of a provider.

Providers may emit an `unknown` entity kind when they establish identity or a
relationship but do not carry trustworthy type information. A later typed
source refines that placeholder in place; `unknown` must never overwrite or
conflict with a known kind.
