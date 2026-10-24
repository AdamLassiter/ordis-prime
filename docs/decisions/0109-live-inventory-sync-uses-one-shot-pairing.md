# 0109: Live inventory sync uses one-shot pairing

## Status

Accepted.

## Context

Digital Extremes does not publish a delegated account API for complete player
inventory. `warframe-api-helper` demonstrates that a local process can find the
running game's short-lived account identifier and nonce, fetch the same
inventory document represented by AlecaFrame snapshots, and discard the
credentials when the game closes. Sending those credentials to Ordis Prime or
embedding a durable Ordis account token in a downloaded executable would make
the web service an unnecessary credential broker.

The helper depends on undocumented process memory and service behavior. Its
MIT licence carries the Commons Clause, and an unsigned derivative will trigger
Windows trust warnings.

## Decision

Provide an open-source Windows x64 `ordis-prime-updater.exe` derived from the
reviewed helper algorithm. It obtains and uses Warframe credentials entirely on
the player's machine, writes no inventory file, and uploads only the JSON
response over HTTPS.

Cross-compile a static executable while building the production web image, and
serve it with its checksum and redistribution notices from that instance. Keep
the native Windows tagged-release build as an additional distribution and
verification path, not as a runtime dependency of a self-hosted deployment.

The authenticated Operator page issues a random ten-minute pairing code that
contains the instance origin and a 256-bit secret. Store only the secret's
SHA-256 hash. Consume it atomically on the first upload, bind it to one player,
and retain only a capped success or failure result for 24 hours. Never store or
log the code, Warframe credentials, or raw inventory.

Live imports are automatic but strictly monotonic: import supported inventory
and verified progression, never reduce existing state, never create a build,
and apply in one transaction. AlecaFrame retains its previewed merge and
explicit replacement workflow.

## Consequences

- A live import needs no durable Ordis or Warframe credential and cannot become
  unattended background synchronization.
- Replaying, sharing or intercepting an already consumed code cannot authorize
  another import.
- Process-signature or endpoint drift fails visibly and requires an updater
  release; it cannot corrupt the catalog or lower player state.
- The first binary is unsigned, Windows-only, non-commercially distributed,
  and published with source attribution and a SHA-256 checksum.
- Runtime images are larger and slower to build because they contain a MinGW
  build stage, while worker images do not copy the resulting executable.
