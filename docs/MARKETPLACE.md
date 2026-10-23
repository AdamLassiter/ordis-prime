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
usable and offers a direct Warframe.market link. No background job enumerates
orders across the catalog.

The displayed platinum values are offers, not completed-sale valuations or
guaranteed prices. They do not mutate inventory, enter acquisition scoring, or
claim that an item is currently tradeable on the player's platform. Ranked
mods, item subtypes, remaining charges, Ayatan stars, offline orders, and price
history need explicit controls before they can be compared meaningfully.

Ordis Prime does not accept Warframe.market credentials or use the legacy v1
login flow. The public v2 documentation currently describes OAuth as planned
but does not permit third-party client registration. Listing creation,
modification, deletion, WebSocket presence, and automated trade messages stay
out of scope until a supported delegated authorization route exists and is
reviewed separately.
