# Ordis Prime Updater

This optional Windows x64 utility performs a one-shot live inventory import. It
must be run while Warframe is open and logged in. Paste the ten-minute pairing
code shown on Ordis Prime's Operator page; the updater finds the game's
temporary API credentials locally, fetches the current inventory, uploads only
that JSON document, and exits.

The updater never writes the credentials or inventory to disk. Ordis Prime does
not retain the raw inventory and restricts this path to a monotonic inventory
and progression merge.

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
