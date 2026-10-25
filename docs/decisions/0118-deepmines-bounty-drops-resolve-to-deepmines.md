# 0118: Deepmines bounty drops resolve to Deepmines

## Status

Accepted.

## Context

WFCD embeds Nokko acquisition rows in item records with precise labels such as
`Nokko: Corporate Restructuring Rewards, Rotation B`, but those rows do not
carry a canonical node identifier. Leaving the node empty makes Planner
candidates plain text even though the Wiki mission source already promotes the
canonical Deepmines node. Treating each reward rotation as a Star Chart node
would misrepresent three bounties and their normal, Steel Path, and rotation
variants as eighteen separate locations.

The Wiki separately establishes that Nightcap offers three permanent Deepmines
bounties and names them, while Nightcap's own page establishes that the vendor
is physically located in Fortuna.

## Decision

Map WFCD embedded drop labels in the Nokko bounty family to the canonical
Deepmines node while retaining the provider's complete location label and
rotation text on every drop. This gives Planner and Codex a navigable location
without creating synthetic Star Chart nodes.

The vendor adapter snapshots both the Nightcap and Bounty pages. It retains the
physical `occurs-at` relation to Fortuna, adds a separately cited `involves`
relation to Deepmines, and records the three current bounty names as a sourced
attribute. Parsing fails closed if the expected three-row Wiki table
disappears, so a source-format change cannot silently publish stale structure.

## Consequences

- Nokko candidate locations link to Deepmines while still displaying their
  exact bounty, difficulty, and rotation labels.
- Deepmines aggregates the associated drops without pretending reward
  rotations are map locations.
- Nightcap's Codex record names the bounties and links to Deepmines, while its
  physical location remains Fortuna.
- Other vendor-labelled or bounty-labelled drops remain unlinked until their
  canonical location has equivalent sourced evidence.
