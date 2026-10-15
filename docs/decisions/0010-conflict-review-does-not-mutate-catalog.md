# ADR 0010: Separate conflict review from catalog repair

Status: accepted

Ingestion conflicts describe observations the resolver could not apply safely.
The stored conflict does not contain enough provider-neutral information to
replay that observation or to infer which canonical mutation an operator wants.

Administrators may therefore mark a conflict reviewed or reopen it, with a
required note and an append-only actor/timestamp audit trail. These actions only
change review state. They never bind an external identifier, merge entities, or
rewrite an active source run.

Actual factual repair remains source-driven: fix a cited manual overlay or
provider adapter, then promote a new immutable source version. ADR 0028 refines
identity repair only: conflicts now retain external IDs and may create an
explicit, audited mapping whose revision drives a new immutable replay run.
