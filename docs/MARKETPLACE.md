# Marketplace

Warframe.market integration is read-only and anonymous. A daily static adapter
snapshots the public v2 item manifest and bridges its item IDs and slugs to WFCD
game references. Market assertions have low canonical priority: they can make a
previously absent tradable record discoverable, but do not rename or reclassify
a higher-priority WFCD or Wiki entity.

When a catalog entity has a linked market slug, its detail page asks Ordis
Prime's server route for Warframe.market's top online buy and sell orders. The
server identifies the application, requests PC cross-play English results, and
caches the response for one minute. A provider failure leaves the catalog page
usable and offers a direct Warframe.market link.

The Index is the one bounded exception to purely on-demand order fetching. Its
daily job visits only relics, relic rewards, Standing-offered mods, and Arcanes,
then stores aggregate listing and quick-sale prices without user or order data.
The exact valuation rules, retention, and freshness limits are in
[The Index](INDEX.md).

The displayed platinum values are offers, not completed-sale valuations or
guaranteed prices. They do not mutate inventory, enter acquisition scoring, or
claim that an item is currently tradeable on the player's platform. The Index
explicitly distinguishes relic subtypes and Arcane ranks. Remaining charges,
Ayatan stars, offline orders, and completed-sale history are not modeled.

Ordis Prime does not accept Warframe.market credentials or use the legacy v1
login flow. The public v2 documentation currently describes OAuth as planned
but does not permit third-party client registration. Listing creation,
modification, deletion, WebSocket presence, and automated trade messages stay
out of scope until a supported delegated authorization route exists and is
reviewed separately.
