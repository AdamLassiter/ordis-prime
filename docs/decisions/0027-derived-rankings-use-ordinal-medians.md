# ADR 0027: Derive ranking summaries with ordinal medians

## Decision

The ranking comparison offers an opt-in derived summary while preserving every
source's raw tier. For each covered source with an ordered scale of at least two
tiers, its best tier maps to 0 and its worst tier maps to 1. Intermediate tiers
are evenly spaced by `tier index / (tier count - 1)`.

For an item covered by at least two usable sources, the application reports the
median normalized position and the full minimum-to-maximum range. For an even
number of sources, the median is the mean of the two middle positions. Missing
rankings and one-tier scales are excluded. Each included source has equal
weight.

The UI labels this a derived ordinal result, displays the formula and omissions,
and keeps the raw tiers and citations in the same row. The derived column is off
by default and does not alter source records.

## Rationale

Users comparing many tier lists benefit from a compact indication of central
tendency and disagreement, but tier labels from different authors are not a
shared cardinal scale. Normalizing only declared order makes the smallest
inspectable assumption. A median is less sensitive than a mean to one extreme
source, while the range prevents the central value from hiding disagreement.

## Consequences

- Even spacing assumes ordinal tiers divide a scale uniformly; this may not
  match an author's intent and is stated beside the result.
- Within-tier item position, source expertise, publication date, game version,
  scope differences and missing coverage do not affect the value.
- A 0% result means that every median-contributing placement was at the top of
  its own source scale, not that an item received a universal numeric score.
- Future weighting or scope-aware methods must be separate named methods rather
  than silently changing this calculation.
