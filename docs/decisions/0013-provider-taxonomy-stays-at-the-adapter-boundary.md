# ADR 0013: Keep provider taxonomy exceptions at the adapter boundary

## Decision

Canonical entities distinguish arcanes and Archon Shards from generic resources
or unknown items. The WFCD item adapter maps the explicit `Arcanes` category to
`arcane`. It maps the stable internal-name prefix used by Archon Shards to
`shard`, even though the current aggregate payload labels those records `Misc`.

The domain model does not expose WFCD categories or internal-name patterns. Any
future source must independently map its vocabulary to the same canonical kinds.

## Rationale

Build slots, catalog filters and ownership questions need semantic item kinds;
leaving these records as `unknown` makes those joins depend on display-name
searches. At the same time, a provider-specific exception is evidence about one
input format rather than a universal Warframe rule. Keeping it in the adapter
allows a parser version change and fixture to make the compromise visible and
replayable.

## Consequences

- Retained WFCD bytes can be promoted again under the new parser version.
- If WFCD changes the shard internal names, fixtures and live refresh review must
  update the adapter rule.
- Canonical consumers can treat `arcane` and `shard` as stable kinds without
  knowing why WFCD records were classified that way.
