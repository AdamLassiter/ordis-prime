# ADR 0010: Separate conflict review from catalog repair

Status: accepted

Ingestion conflicts describe observations the resolver could not apply safely.
The stored conflict does not contain enough provider-neutral information to
replay that observation or to infer which canonical mutation an operator wants.

Administrators may therefore mark a conflict reviewed or reopen it, with a
required note and an append-only actor/timestamp audit trail. These actions only
change review state. They never bind an external identifier, merge entities, or
rewrite an active source run.

Actual repair remains source-driven: fix a cited manual overlay or provider
adapter, then promote a new immutable source version. A future persistent
identity-override mechanism must store an explicit external-ID mapping and
define safe replay semantics before it can be offered as a conflict action.
