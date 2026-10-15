# 0022: Refresh throughput uses normalized records

Status: accepted

## Context

Provider payload bytes and top-level JSON counts do not have a consistent
meaning across static catalogs and live world state. Operational throughput is
still useful for spotting stalled or unexpectedly empty adapters, but it must
not imply that unlike source records are equivalent game facts.

## Decision

Persist one processed-record count on every successful refresh: collected
observations for static adapters and normalized availability windows for world
state. Derive duration and records per second from the refresh's persisted
start and finish timestamps. Failed and running attempts have no processed
count and do not contribute to throughput.

Keep worker job filtering separate. Job history filters exact job kind and
status columns plus the explicit `source` member of the JSON payload; it does
not inspect error strings or infer provider identity from job kind.

## Consequences

- Metrics remain comparable across runs of the same adapter and honest about
  what was actually promoted.
- Cross-provider rate comparisons need context because observation complexity
  differs.
- Existing refresh rows show no count rather than a fabricated zero.
- Metrics cover retained refresh history; a future retention policy must state
  whether aggregates are lifetime or windowed.
