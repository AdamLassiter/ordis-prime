# Ordis Prime Updater

This optional Windows x64 utility performs live inventory imports. For initial
pairing, run it while Warframe is open and paste the ten-minute code shown on
Ordis Prime's Operator page. It registers a named, revocable updater device and
stores its inventory-sync-only credential in Windows Credential Manager.

After a successful sync, the updater offers an optional system-tray mode and a
separate opt-in to launch at Windows sign-in. The tray checks hourly while the
game is absent, synchronizes when it first detects a new running session, and
synchronizes at most hourly while that session remains open. Its menu exposes
Sync now, launch-at-sign-in, status, last success, the latest bounded error, and
Exit. Transient failures leave the tray process ready to retry.

The updater never writes Warframe credentials or inventory to disk. Ordis Prime
does not retain the raw inventory and restricts this path to a monotonic
inventory and progression merge. Device credentials rotate after successful
requests; only their hashes are stored by the server. Revoking a device from
the Operator page makes its next request fail.

## Build and test

```text
cmake -S tools/ordis-prime-updater -B build/updater -A x64
cmake --build build/updater --config Release
ctest --test-dir build/updater -C Release --output-on-failure
```

The GitHub `Windows updater` workflow performs the same build. An
`updater-v*` tag publishes the executable, SHA-256 checksum and third-party
notices to a GitHub Release.

The production web container also cross-compiles a static executable and serves
it from `/downloads/ordis-prime-updater-windows-x64.exe`, alongside its checksum
and redistribution notices. The Operator page uses this instance-local copy.

## Security and compatibility

Release builds require HTTPS, except that `http://localhost` is accepted for
local development. The first releases are unsigned and may trigger Windows
SmartScreen. The memory signature and inventory endpoint are undocumented and
may change; failures stop the import rather than falling back to guessed data.

See `THIRD_PARTY_NOTICES.md` before redistribution. In particular, the source
algorithm's Commons Clause restriction requires review before commercial use.
