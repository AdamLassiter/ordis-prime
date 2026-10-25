# Player account synchronization

Ordis Prime should reduce manual ownership work, but the hosted application
must not ask for a Warframe password, two-factor code, launcher token or
mobile-app session. Account convenience does not justify making the web service
a credential broker.

As reviewed on 2026-10-23, Digital Extremes exposes public catalog exports,
drop tables, world state, and an opt-in Twitch Arsenal endpoint for a current
loadout. None is a documented, revocable OAuth-style API for a player's complete
inventory, mastery, quest, Star Chart, Foundry, or Helminth state. The official
Companion application's authenticated protocol is not treated as public API.

One implemented boundary is an explicit upload of AlecaFrame's local
`lastData.dat` snapshot. Ordis Prime reimplements the documented AES-128-CBC
container decoding in TypeScript, unwraps `InventoryJson`, allow-lists the
player fields it understands, and discards the encrypted and decrypted bytes
after the request. It never reads AlecaFrame's directory itself and does not use
`deltas.dat`, an Aleca API, credentials or background polling.

Every snapshot must be previewed before it is applied. Merge mode raises known
counts and positive mastered or subsumed assertions without lowering manual
state. Replace mode is an explicit destructive choice: the preview enumerates
decreases, the player confirms them, and supported WFCD-addressable collection
fields are reset before the snapshot is applied. Wanted counts and notes remain
player-authored in either mode. A SHA-256 digest binds confirmation to the file
that was previewed; the server reparses it inside the apply transaction and
does not retain the digest as account identity.

The importer also accepts directly evidenced `PlayerLevel`, conservative
rank-30 XP assertions, and the verified NORMAL/SENTINEL current-loadout shape.
Loadout import creates a new draft only on request. Unsupported preset types,
partial ranks, capacity upgrades, adapters, Focus progress, Archon Shards and
ambiguous identifiers remain visible omissions rather than inferred values.
This is still import, not continuous sync.

The second boundary is the optional Windows updater. It derives its
credential discovery from `warframe-api-helper`: while Warframe is running, the
local executable reads the short-lived account identifier and nonce from game
memory, fetches `inventory.php`, and sends only the returned inventory JSON to
Ordis Prime. It never prints or writes the credentials or inventory. Because
this is undocumented game and service behavior, breakage fails closed and does
not weaken the AlecaFrame path.

The Operator page creates a random ten-minute pairing code. SQLite retains only
its SHA-256 hash; the code is consumed atomically to register a named updater
device. The client-generated device secret is stored in Windows Credential
Manager and only its rotating hashes are stored by Ordis Prime. The Operator
page lists creation and last-use status and can revoke the device before its
next request. Live updater imports are deliberately narrower than snapshot imports: they always
merge inventory and verified progression monotonically, never reduce state,
never create builds, and need no destructive confirmation. Raw API bytes are
discarded after the request. A capped result remains for 24 hours so the page
can report what happened; the worker removes old pairings. Device status and
audit metadata are bounded, while account deletion cascades through every
device and event.

Tray mode and launch at sign-in are separate explicit choices. The tray probes
hourly while the game is absent, synchronizes when a running session is first
detected, and then no more than hourly until it exits. Manual sync, visible
status, last success, the latest bounded error and clean exit remain available.
Transient failures do not terminate the process. Each successful request
rotates to a client-generated replacement credential; a short exact-request
grace recovers a lost response without reapplying the import.

The production web container cross-compiles the updater as a static Windows x64
executable and serves it, its checksum, and its redistribution notices from the
same Ordis Prime instance. This keeps a self-hosted deployment independent of a
GitHub Release. Tagged releases remain a second distribution channel and are
built by the native Windows workflow.

Server-side or authoritative account sync becomes eligible only if Digital
Extremes publishes a supported authorization contract with all of the following:

- delegated read-only scopes and a consent screen;
- revocable tokens that never expose the player's password or session cookie;
- documented stable player-data identifiers and platform/cross-save semantics;
- clear third-party terms, rate limits, retention rules, and support contact;
- enough freshness/version metadata to reconcile deletions without mistaking a
  partial or stale response for authoritative absence.

If that contract appears, the first slice should be a user-triggered read-only
sync using the same preview and canonical resolver. It should retain the last
successful sync timestamp and source version and keep manual overrides distinct
from provider assertions. Server-side polling, write actions, Foundry control,
and trading are separate decisions, not implied by read access.

The Twitch Arsenal endpoint may later provide an optional current-loadout hint
for players who enabled Digital Extremes' sharing setting. It is not evidence of
ownership and must not mutate inventory. OCR, log scraping, and packet
interception remain out of scope. The updater's reviewed local process-memory
reader is the sole exception and remains isolated from the web service.
