# 0098: Vendors require cited node mappings

Status: accepted

## Context

Structured vendor data can enumerate wares and currencies but does not reliably
identify the canonical Star Chart location. Guessing from vendor names would
create false navigation relationships.

## Decision

Promote a vendor and `occurs-at` relation only when a separately captured Wiki
page establishes its canonical location. Offerings remain typed canonical
entities with cost notes and `offers` relations. Start with Nightcap at Fortuna;
do not infer locations for the remaining vendor module entries.

## Consequences

Nightcap, Nokko parts and Fergolyte are discoverable together without weakening
identity rules. Vendor coverage is intentionally incomplete, and Deepmines
bounty rotations still need a dedicated typed model.
