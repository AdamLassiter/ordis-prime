# ADR 0007: Share immutable build snapshots

Status: accepted

Editable builds remain private player state. Sharing serializes one revision to
an immutable snapshot addressed by a high-entropy unlisted key. Subsequent edits
create a different draft revision and never alter an existing shared result.

This duplicates a small amount of data, but makes shared links safe to discuss,
compare and cite. Snapshot entries retain catalog kind and slug for navigation
while also embedding display names so catalog retirement does not make the
shared artifact unreadable.
