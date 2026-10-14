# ADR 0011: Model recurring todos as linked occurrences

Status: accepted

A recurring task needs completed history without relying on a background job to
materialize future work. Mutating one row's due date would erase that history,
while scheduling every future occurrence would create unbounded speculative
state.

Completing a recurring todo therefore preserves the completed row and creates
one next open occurrence. Its due date is the previous due date plus an explicit
day interval, not the completion time. The successor stores a unique predecessor
key, making repeated completion requests and reopening then re-completing old
history idempotent.

Portable profiles encode predecessor links as validated array indexes and
restore them after all todo rows are inserted. This keeps restored histories
from generating duplicate successors. Calendar expressions such as weekdays or
monthly ordinals remain out of scope until they have explicit timezone and
missed-occurrence semantics.
