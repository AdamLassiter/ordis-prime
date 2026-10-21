# 0080: Boss is a specific enemy classification

Status: accepted

## Context

WFCD imports a broad enemy catalog but does not identify bosses with a dedicated
kind. The structured Wiki mission module explicitly names a `Boss` for selected
nodes. Creating a second same-name entity would fragment discovery progress and
relationships, while rejecting the source would discard stronger attributed
classification evidence.

## Decision

Treat `boss` as a more specific form of the canonical `enemy` kind during
identity resolution. A boss observation may match a same-name enemy and promote
that entity to boss in place. A later broad enemy observation may match the boss
but cannot downgrade it. All other typed kind disagreements remain conflicts,
and an `unknown` observation retains its existing conservative behavior.

Parse only the structured mission `Boss` field. Emit one source-owned boss
identity per distinct value and a cited `occurs-at` relation from that identity
to each declaring node. Do not infer bosses from mission type, internal-name
fragments, drop tables or article prose.

Expose incoming `occurs-at` and `involves` relations on node pages. Entity pages
must route node subjects to the node detail view rather than a generic catalog
URL.

## Consequences

- Existing WFCD descriptions, aliases, inventory references and discovery
  progress remain attached when stronger boss evidence arrives.
- The atlas and node graph gain reciprocal, source-attributed boss navigation.
- Composite source labels such as a two-boss encounter remain one source-owned
  identity until a source provides a safe decomposition.
- Bosses absent from structured mission records are not guessed and remain a
  documented coverage gap.
