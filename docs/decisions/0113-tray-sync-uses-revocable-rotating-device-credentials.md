# 0113: Tray sync uses revocable rotating device credentials

## Status

Accepted. Supersedes ADR 0109's strictly one-shot lifecycle while preserving
its local Warframe-credential boundary.

## Context

Repeated one-shot pairings make safe, periodic local synchronization needlessly
interactive. Reusing the ten-minute pairing secret would turn a narrow bootstrap
credential into a permanent bearer token and provide no independent device
revocation. The updater still depends on undocumented local process memory and
must not move temporary game credentials or raw inventory into durable storage.

## Decision

A successful pairing registers one named updater device. The client generates
the long-lived secret; Windows stores it in Credential Manager and Linux uses a
private XDG state file as decided in ADR 0114. SQLite stores its SHA-256 hash.
The credential authorizes only the monotonic inventory-sync route and is not an
account/session API token.

Each successful request supplies a client-generated replacement credential and
unique request ID. The server atomically applies the import, rotates hashes,
and retains the preceding hash for a ten-minute retry grace. A retry must present
the exact preceding token, request ID, and replacement hash, and returns the
bounded prior result without reapplying the import. Other replays fail. Pairing
creation and device requests are rate-limited. Device records retain last-used,
last-success, and one bounded error; per-device audit events are capped at 100.

The Operator page lists devices and can revoke each one. Revocation replaces
stored hashes and is checked on the next request. Account deletion cascades to
pairings, devices, and their audit events.

Pairing registers and persists the device before attempting to discover
Warframe, then the updater enters tray mode. Launch at sign-in is a separate
opt-in stored in the Windows Run key or an XDG autostart entry. While Warframe
is absent, the schedule probes once per minute. It synchronizes immediately on
the first detection of a running session and no more than hourly while the game
remains running. It also probes a known-running session once per minute to notice exit,
returns to the waiting state afterward, and keeps running after transient
errors. Warframe being absent, including during a manual sync race, is not
reported as an updater failure. The tray menu exposes status, last success,
bounded error, Sync now, startup choice, and Exit.

## Consequences

- Raw inventory and Warframe account/nonce values remain memory-only on the
  player's machine; server persistence contains only the normalized monotonic
  import result.
- A stolen device bearer can perform only bounded inventory sync until it is
  rotated or revoked. It cannot read profile data or mutate other account state.
- Losing the server response after rotation is recoverable without accepting a
  general duplicate request.
- The unsigned, undocumented-provider, and non-commercial redistribution
  caveats from ADR 0109 remain.
- Server-side polling and authoritative deletion reconciliation remain separate
  future decisions.
