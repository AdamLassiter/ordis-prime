# Player account synchronization

Ordis Prime should reduce manual ownership work, but it must not ask for a
Warframe password, two-factor code, launcher token, mobile-app session, or game
process access. Account convenience does not justify making the companion app a
credential broker or relying on an unsupported private protocol.

As reviewed on 2026-10-23, Digital Extremes exposes public catalog exports,
drop tables, world state, and an opt-in Twitch Arsenal endpoint for a current
loadout. None is a documented, revocable OAuth-style API for a player's complete
inventory, mastery, quest, Star Chart, Foundry, or Helminth state. The official
Companion application's authenticated protocol is not treated as public API.

The implemented boundary is therefore an explicit local upload of a raw
inventory response the player obtained through a tool they already trust. The
parser allow-lists inventory arrays and `ItemType` identifiers, discards account
fields and raw bytes, and only raises known counts or records confirmed Helminth
subsumes. It cannot silently erase manual state. This is import, not continuous
sync.

Automatic account sync becomes eligible only if Digital Extremes publishes a
supported authorization contract with all of the following:

- delegated read-only scopes and a consent screen;
- revocable tokens that never expose the player's password or session cookie;
- documented stable player-data identifiers and platform/cross-save semantics;
- clear third-party terms, rate limits, retention rules, and support contact;
- enough freshness/version metadata to reconcile deletions without mistaking a
  partial or stale response for authoritative absence.

If that contract appears, the first slice should be a user-triggered read-only
sync with an audit preview. It should map provider IDs through the same canonical
resolver, show additions/decreases before applying them, retain the last
successful sync timestamp and source version, and keep manual overrides distinct
from provider assertions. Background polling, write actions, Foundry control,
and trading are separate decisions, not implied by read access.

The Twitch Arsenal endpoint may later provide an optional current-loadout hint
for players who enabled Digital Extremes' sharing setting. It is not evidence of
ownership and must not mutate inventory. OCR, log scraping, packet interception,
and process-memory readers remain out of scope.
