# Market

Market is a public analysis workspace built from the canonical catalog,
not a listing manager. It answers three recurring questions:

- Which relics are worth opening, selling unopened, or refining?
- Which syndicate mods return the most platinum per 1,000 Standing?
- What are rank-zero and maximum-rank Arcanes currently worth, and which
  Standing vendors offer them?

## Relic valuation

WFCD supplies the six reward slots and exact probabilities for each refinement.
Warframe.market supplies bounded aggregate prices. The default view is Radiant,
all eras, solo opening, and listing value. Filters also cover every refinement,
vault state, era, quick-sale value, and a four-player same-relic share.

Solo expected value is the probability-weighted sum of the six rewards. The
four-player value is the expected maximum of four independent rolls from that
same distribution. It is a value per relic consumed by one player, not the
combined value of all four relics and not a guarantee that a squad shares the
same refinement. Direct unopened-relic value and the open-minus-sell delta are
shown separately. Ducat EV and platinum gained per Void Trace are supporting
signals rather than one opaque recommendation score.

## Price semantics

The default listing estimate is the median of the five cheapest visible online
sell orders. Quick sale is the highest visible online buy order. Stack prices
are normalized per traded copy. Relic subtype and Arcane rank are matched
explicitly. Missing order coverage stays missing; it is never converted to zero.

The daily job stores only aggregate values and order counts. It does not retain
seller identities, order text, or individual order books. A run is resumable in
bounded batches, and the provenance console shows current and historical runs.
Snapshots become visibly stale after 36 hours and expire from calculations after
seven days. Thirty completed runs are retained by default.

## Standing context

Structured Wiki vendor data supplies numeric Standing costs and rank
requirements. The mod view defaults to the six core syndicates but can include
every parsed Standing faction. The Arcane view always covers every tradeable
Arcane and annotates Standing sources where available. Non-Standing currencies,
syndicate reputation gain, daily caps, taxes, trade limits, and time-to-farm are
not folded into the ratio.

## Operational use

The normal worker queues one market-price refresh per day after market-linked
catalog data exists. An administrator can also queue it from `/data-sources` or
run a complete resumable refresh directly:

```sh
pnpm data:prices
```

`ORDIS_MARKET_PRICE_BATCH_SIZE` controls batch size and
`ORDIS_MARKET_PRICE_REQUEST_DELAY_MS` controls the delay between public API
requests. The default delay is 500 ms.
