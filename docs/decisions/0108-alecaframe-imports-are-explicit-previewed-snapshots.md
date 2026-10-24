# 0108: AlecaFrame imports are explicit previewed snapshots

## Status

Accepted.

## Context

There is no supported delegated Warframe account API for complete private
player state. AlecaFrame writes an encrypted local `lastData.dat` containing a
full inventory document, and the public Sainan parser documents its fixed
AES-128-CBC container. Asking Ordis Prime users to run a separate Pluto script
would add an unnecessary manual conversion and an extra place for sensitive raw
data to persist.

The snapshot is broad but not every field has a stable, demonstrated meaning.
It can also be stale. Applying it without review could erase manual state or
turn unknown values into false facts.

## Decision

Decode `lastData.dat` in the authenticated web request with native TypeScript
and Node cryptography. Normalize the optional `InventoryJson` wrapper, validate
allow-listed structures, and resolve game paths only through exact WFCD
`uniqueName` identifiers. Never retain or log the source bytes, decoded object,
account identifiers or credentials.

Require a preview before apply and bind the two requests with the file's
SHA-256 digest. Merge mode is monotonic. Replace mode is explicitly confirmed,
may lower supported owned, built, mastered and subsumed state, and preserves
wanted counts and notes. Apply reparses the snapshot and commits inventory,
verified progression and an optional newly created build in one transaction.

Import only directly evidenced fields or conservative derivations: exact
Mastery Rank, confirmed rank-30/mastered evidence, Helminth subsumes, and the
verified NORMAL/SENTINEL equipped loadout shape. Report all other player data
as unsupported or unresolved rather than guessing. Keep a provider registry in
the Operator UI so another source can add its own adapter without weakening the
AlecaFrame parser.

## Consequences

- Players no longer need to decrypt or convert AlecaFrame data separately.
- Replace mode is visibly destructive but cannot silently change a different
  file than the one reviewed.
- Imported builds never overwrite player-authored drafts.
- Snapshot history and per-field import provenance are not persisted yet, so a
  later official synchronization provider still needs an assertion/audit model.
- Automatic file watching, `deltas.dat`, Aleca APIs, process access and account
  credentials remain outside the application boundary.
