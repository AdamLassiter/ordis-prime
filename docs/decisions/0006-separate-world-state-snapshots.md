# ADR 0006: Promote dynamic world state separately

Status: accepted

Static catalog facts and live availability change at different rates and have
different failure modes. World-state adapters therefore emit provider-neutral
availability windows into their own immutable snapshots, with one active
snapshot per source. They reuse snapshot storage and the source-operations log,
but do not create canonical catalog releases.

This lets a frequent world-state poll fail without disturbing catalog data and
lets the application replace the provider without changing timer, todo or alert
rules. Absolute activation and expiry instants are authoritative; countdown text
is derived by clients. Dynamic node labels remain source evidence until an
explicit reconciliation layer can link them to canonical nodes.
