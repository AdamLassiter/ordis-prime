import type Database from "better-sqlite3";
import type { RelicRefinement } from "@ordis-prime/domain";

export type MarketPriceBasis = "listing" | "quick-sale";
export type RelicSquadMode = "solo" | "four-player";

export interface MarketIndexStatus {
  runId?: string;
  status?: "running" | "succeeded" | "partial" | "failed";
  startedAt?: number;
  finishedAt?: number;
  targetCount: number;
  completedCount: number;
  failedCount: number;
}

interface Price {
  listing?: number;
  quickSale?: number;
  sellOrderCount: number;
  buyOrderCount: number;
  observedAt: number;
  stale: boolean;
  expired: boolean;
}

export interface RelicIndexReward {
  entity: { id: string; kind: string; slug: string; name: string };
  rarity: string;
  chance: number;
  marketSlug?: string;
  value?: number;
  contribution?: number;
  ducats: number;
  ownedCount?: number;
}

export interface RelicIndexRow {
  entity: { id: string; kind: string; slug: string; name: string };
  marketSlug: string;
  era: string;
  vaulted: boolean;
  refinement: RelicRefinement;
  directValue?: number;
  openValue?: number;
  soloOpenValue?: number;
  squadOpenValue?: number;
  openingDelta?: number;
  ducatExpectedValue: number;
  traceEfficiency?: number;
  bestRefinement?: RelicRefinement;
  pricedRewards: number;
  rewardCount: number;
  observedAt?: number;
  stale: boolean;
  ownedCount?: number;
  rewards: RelicIndexReward[];
}

export function getMarketIndexStatus(
  sqlite: Database.Database,
): MarketIndexStatus {
  const row = sqlite
    .prepare(
      `select id as runId, status, started_at as startedAt,
              finished_at as finishedAt, target_count as targetCount,
              completed_count as completedCount, failed_count as failedCount
       from market_price_runs order by started_at desc limit 1`,
    )
    .get() as
    | (Omit<MarketIndexStatus, "status"> & {
        status: MarketIndexStatus["status"];
      })
    | undefined;
  return row ?? { targetCount: 0, completedCount: 0, failedCount: 0 };
}

export function listRelicMarketIndex(
  sqlite: Database.Database,
  input: {
    refinement?: RelicRefinement;
    era?: string;
    availability?: "all" | "current" | "vaulted";
    basis?: MarketPriceBasis;
    squad?: RelicSquadMode;
    query?: string;
    userId?: string;
    now?: number;
  } = {},
): RelicIndexRow[] {
  const refinement = input.refinement ?? "radiant";
  const basis = input.basis ?? "listing";
  const now = input.now ?? Date.now();
  const prices = loadLatestPrices(sqlite, now);
  const inventory = loadInventory(sqlite, input.userId);
  const raw = sqlite
    .prepare(
      `select reward.relic_id as relicId, relic.kind as relicKind,
              relic.slug as relicSlug, relic.name as relicName,
              reward.refinement, reward.rarity, reward.chance,
              item.id as rewardId, item.kind as rewardKind,
              item.slug as rewardSlug, item.name as rewardName,
              (select value from external_ids where entity_id = relic.id
                 and source_id = 'warframe-market-items' and namespace = 'item-slug' limit 1) as relicMarketSlug,
              (select value from external_ids where entity_id = item.id
                 and source_id = 'warframe-market-items' and namespace = 'item-slug' limit 1) as rewardMarketSlug,
              cast(coalesce((select attribute.value from entity_attributes attribute
                 join source_runs arun on arun.id = attribute.source_run_id and arun.status = 'active'
                 where attribute.entity_id = item.id and attribute.key = 'ducats'
                 order by arun.retrieved_at desc limit 1), '0') as integer) as ducats,
              coalesce((select attribute.value from entity_attributes attribute
                 join source_runs arun on arun.id = attribute.source_run_id and arun.status = 'active'
                 where attribute.entity_id = relic.id and attribute.key = 'vaulted'
                 order by arun.retrieved_at desc limit 1), 'false') as vaulted
       from relic_rewards reward
       join source_runs run on run.id = reward.source_run_id and run.status = 'active'
       join entities relic on relic.id = reward.relic_id and relic.retired = 0
       join entities item on item.id = reward.reward_id and item.retired = 0
       order by relic.name, reward.refinement, reward.chance desc, item.name`,
    )
    .all() as Array<{
    relicId: string;
    relicKind: string;
    relicSlug: string;
    relicName: string;
    relicMarketSlug: string | null;
    refinement: RelicRefinement;
    rarity: string;
    chance: number;
    rewardId: string;
    rewardKind: string;
    rewardSlug: string;
    rewardName: string;
    rewardMarketSlug: string | null;
    ducats: number;
    vaulted: string;
  }>;
  const grouped = new Map<string, typeof raw>();
  for (const row of raw)
    grouped.set(row.relicId, [...(grouped.get(row.relicId) ?? []), row]);
  const result: RelicIndexRow[] = [];
  for (const rows of grouped.values()) {
    const first = rows[0]!;
    if (!first.relicMarketSlug) continue;
    const era = first.relicName.split(/\s+/)[0] ?? "Unknown";
    const vaulted = first.vaulted === "true";
    if (
      input.era &&
      input.era !== "all" &&
      era.toLowerCase() !== input.era.toLowerCase()
    )
      continue;
    if (input.availability === "current" && vaulted) continue;
    if (input.availability === "vaulted" && !vaulted) continue;
    if (
      input.query &&
      !first.relicName.toLowerCase().includes(input.query.trim().toLowerCase())
    )
      continue;
    const values = new Map<
      RelicRefinement,
      ReturnType<typeof calculateRelic>
    >();
    for (const candidate of [
      "intact",
      "exceptional",
      "flawless",
      "radiant",
    ] as const) {
      const candidateRows = rows.filter((row) => row.refinement === candidate);
      if (candidateRows.length)
        values.set(
          candidate,
          calculateRelic(candidateRows, prices, basis, inventory),
        );
    }
    const selected = values.get(refinement);
    if (!selected) continue;
    const directPrice = prices.get(priceKey(first.relicId, refinement, null));
    const directValue = priceValue(directPrice, basis);
    const soloOpenValue = selected.openValue;
    const squadOpenValue = selected.squadValue;
    const openValue =
      input.squad === "four-player" ? squadOpenValue : soloOpenValue;
    const intact = values.get("intact")?.openValue;
    const traceCost = {
      intact: 0,
      exceptional: 25,
      flawless: 50,
      radiant: 100,
    }[refinement];
    const best = [...values.entries()]
      .filter(
        (
          entry,
        ): entry is [
          RelicRefinement,
          ReturnType<typeof calculateRelic> & { openValue: number },
        ] => entry[1].openValue !== undefined,
      )
      .sort((left, right) => right[1].openValue - left[1].openValue)[0]?.[0];
    result.push({
      entity: {
        id: first.relicId,
        kind: first.relicKind,
        slug: first.relicSlug,
        name: first.relicName,
      },
      marketSlug: first.relicMarketSlug,
      era,
      vaulted,
      refinement,
      directValue,
      openValue,
      soloOpenValue,
      squadOpenValue,
      openingDelta:
        openValue !== undefined && directValue !== undefined
          ? openValue - directValue
          : undefined,
      ducatExpectedValue: selected.ducatExpectedValue,
      traceEfficiency:
        traceCost && soloOpenValue !== undefined && intact !== undefined
          ? (soloOpenValue - intact) / traceCost
          : undefined,
      bestRefinement: best,
      pricedRewards: selected.pricedRewards,
      rewardCount: selected.rewards.length,
      observedAt: selected.observedAt,
      stale: selected.stale || Boolean(directPrice?.stale),
      ownedCount: inventory?.get(first.relicId),
      rewards: selected.rewards,
    });
  }
  return result;
}

function calculateRelic(
  rows: Array<{
    rewardId: string;
    rewardKind: string;
    rewardSlug: string;
    rewardName: string;
    rewardMarketSlug: string | null;
    rarity: string;
    chance: number;
    ducats: number;
  }>,
  prices: Map<string, Price>,
  basis: MarketPriceBasis,
  inventory?: Map<string, number>,
) {
  let pricedRewards = 0;
  let ducatExpectedValue = 0;
  let observedAt: number | undefined;
  let stale = false;
  const rewards = rows.map((row): RelicIndexReward => {
    const price = prices.get(priceKey(row.rewardId, null, null));
    const value = row.rewardMarketSlug ? priceValue(price, basis) : 0;
    if (value !== undefined) pricedRewards += 1;
    if (price) {
      observedAt = Math.min(observedAt ?? price.observedAt, price.observedAt);
      stale ||= price.stale;
    }
    ducatExpectedValue += row.chance * row.ducats;
    return {
      entity: {
        id: row.rewardId,
        kind: row.rewardKind,
        slug: row.rewardSlug,
        name: row.rewardName,
      },
      rarity: row.rarity,
      chance: row.chance,
      marketSlug: row.rewardMarketSlug ?? undefined,
      value,
      contribution: value === undefined ? undefined : row.chance * value,
      ducats: row.ducats,
      ownedCount: inventory?.get(row.rewardId),
    };
  });
  const complete = pricedRewards === rewards.length;
  const openValue = complete
    ? rewards.reduce((sum, reward) => sum + reward.chance * reward.value!, 0)
    : undefined;
  const squadValue = complete ? expectedMaximum(rewards, 4) : undefined;
  return {
    rewards,
    pricedRewards,
    ducatExpectedValue,
    observedAt,
    stale,
    openValue,
    squadValue,
  };
}

function expectedMaximum(rewards: RelicIndexReward[], rolls: number): number {
  const grouped = new Map<number, number>();
  for (const reward of rewards)
    grouped.set(
      reward.value!,
      (grouped.get(reward.value!) ?? 0) + reward.chance,
    );
  let cumulative = 0;
  let result = 0;
  for (const [value, probability] of [...grouped.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    const previous = cumulative;
    cumulative += probability;
    result += value * (Math.pow(cumulative, rolls) - Math.pow(previous, rolls));
  }
  return result;
}

export interface SyndicateModIndexRow {
  entity: { id: string; kind: string; slug: string; name: string };
  marketSlug: string;
  faction: string;
  vendor: string;
  core: boolean;
  cost: number;
  quantity: number;
  prerequisiteRank?: number;
  prerequisiteLabel?: string;
  value?: number;
  platinumPerThousandStanding?: number;
  observedAt?: number;
  stale: boolean;
  ownedCount?: number;
}

const CORE_SYNDICATES = new Set([
  "Arbiters of Hexis",
  "Cephalon Suda",
  "New Loka",
  "Red Veil",
  "Steel Meridian",
  "The Perrin Sequence",
]);

export function listSyndicateModIndex(
  sqlite: Database.Database,
  input: {
    basis?: MarketPriceBasis;
    coreOnly?: boolean;
    query?: string;
    userId?: string;
    now?: number;
  } = {},
): SyndicateModIndexRow[] {
  const basis = input.basis ?? "listing";
  const prices = loadLatestPrices(sqlite, input.now ?? Date.now());
  const inventory = loadInventory(sqlite, input.userId);
  const rows = sqlite
    .prepare(
      `select item.id, item.kind, item.slug, item.name, vendor.name as vendor,
            offering.faction, offering.cost, offering.quantity,
            offering.prerequisite_rank as prerequisiteRank,
            offering.prerequisite_label as prerequisiteLabel,
            market.value as marketSlug
     from vendor_offerings offering
     join source_runs run on run.id = offering.source_run_id and run.status = 'active'
     join entities item on item.id = offering.item_id and item.kind = 'mod' and item.retired = 0
     join entities vendor on vendor.id = offering.vendor_id
     join external_ids market on market.entity_id = item.id
       and market.source_id = 'warframe-market-items' and market.namespace = 'item-slug'
     where offering.currency = 'Standing'
     order by offering.faction, item.name`,
    )
    .all() as Array<{
    id: string;
    kind: string;
    slug: string;
    name: string;
    vendor: string;
    faction: string;
    cost: number;
    quantity: number;
    prerequisiteRank: number | null;
    prerequisiteLabel: string | null;
    marketSlug: string;
  }>;
  return rows.flatMap((row) => {
    const core = CORE_SYNDICATES.has(row.faction);
    if (input.coreOnly !== false && !core) return [];
    if (
      input.query &&
      !row.name.toLowerCase().includes(input.query.trim().toLowerCase())
    )
      return [];
    const price = prices.get(priceKey(row.id, null, 0));
    const value = priceValue(price, basis);
    const standingPerUnit = row.cost / row.quantity;
    return [
      {
        entity: { id: row.id, kind: row.kind, slug: row.slug, name: row.name },
        marketSlug: row.marketSlug,
        faction: row.faction,
        vendor: row.vendor,
        core,
        cost: row.cost,
        quantity: row.quantity,
        prerequisiteRank: row.prerequisiteRank ?? undefined,
        prerequisiteLabel: row.prerequisiteLabel ?? undefined,
        value,
        platinumPerThousandStanding:
          value === undefined ? undefined : (value / standingPerUnit) * 1_000,
        observedAt: price?.observedAt,
        stale: price?.stale ?? false,
        ownedCount: inventory?.get(row.id),
      },
    ];
  });
}

export interface ArcaneIndexRow {
  entity: { id: string; kind: string; slug: string; name: string };
  marketSlug: string;
  maxRank: number;
  copiesForMaxRank: number;
  rankZeroValue?: number;
  maxRankValue?: number;
  maxRankPerCopyValue?: number;
  observedAt?: number;
  stale: boolean;
  ownedCount?: number;
  standingOffers: Array<{
    faction: string;
    vendor: string;
    cost: number;
    quantity: number;
    prerequisiteRank?: number;
  }>;
}

export function listArcaneMarketIndex(
  sqlite: Database.Database,
  input: {
    basis?: MarketPriceBasis;
    standingOnly?: boolean;
    query?: string;
    userId?: string;
    now?: number;
  } = {},
): ArcaneIndexRow[] {
  const basis = input.basis ?? "listing";
  const prices = loadLatestPrices(sqlite, input.now ?? Date.now());
  const inventory = loadInventory(sqlite, input.userId);
  const rows = sqlite
    .prepare(
      `select entity.id, entity.kind, entity.slug, entity.name, market.value as marketSlug,
            cast(coalesce((select attribute.value from entity_attributes attribute
              join source_runs arun on arun.id = attribute.source_run_id and arun.status = 'active'
              where attribute.entity_id = entity.id and attribute.key = 'market-max-rank'
              order by arun.retrieved_at desc limit 1), '5') as integer) as maxRank
     from entities entity join external_ids market on market.entity_id = entity.id
       and market.source_id = 'warframe-market-items' and market.namespace = 'item-slug'
     where entity.kind = 'arcane' and entity.retired = 0 order by entity.name`,
    )
    .all() as Array<{
    id: string;
    kind: string;
    slug: string;
    name: string;
    marketSlug: string;
    maxRank: number;
  }>;
  const offerRows = sqlite
    .prepare(
      `select offering.item_id as itemId, offering.faction, vendor.name as vendor,
            offering.cost, offering.quantity, offering.prerequisite_rank as prerequisiteRank
     from vendor_offerings offering
     join source_runs run on run.id = offering.source_run_id and run.status = 'active'
     join entities vendor on vendor.id = offering.vendor_id
     where offering.currency = 'Standing'`,
    )
    .all() as Array<{
    itemId: string;
    faction: string;
    vendor: string;
    cost: number;
    quantity: number;
    prerequisiteRank: number | null;
  }>;
  const offers = new Map<string, ArcaneIndexRow["standingOffers"]>();
  for (const offer of offerRows)
    offers.set(offer.itemId, [
      ...(offers.get(offer.itemId) ?? []),
      { ...offer, prerequisiteRank: offer.prerequisiteRank ?? undefined },
    ]);
  return rows.flatMap((row) => {
    const standingOffers = offers.get(row.id) ?? [];
    if (input.standingOnly && !standingOffers.length) return [];
    if (
      input.query &&
      !row.name.toLowerCase().includes(input.query.trim().toLowerCase())
    )
      return [];
    const rankZero = prices.get(priceKey(row.id, null, 0));
    const maxRank = prices.get(priceKey(row.id, null, row.maxRank));
    const rankZeroValue = priceValue(rankZero, basis);
    const maxRankValue = priceValue(maxRank, basis);
    const copiesForMaxRank = ((row.maxRank + 1) * (row.maxRank + 2)) / 2;
    return [
      {
        entity: { id: row.id, kind: row.kind, slug: row.slug, name: row.name },
        marketSlug: row.marketSlug,
        maxRank: row.maxRank,
        copiesForMaxRank,
        rankZeroValue,
        maxRankValue,
        maxRankPerCopyValue:
          maxRankValue === undefined
            ? undefined
            : maxRankValue / copiesForMaxRank,
        observedAt:
          Math.min(
            rankZero?.observedAt ?? Infinity,
            maxRank?.observedAt ?? Infinity,
          ) === Infinity
            ? undefined
            : Math.min(
                rankZero?.observedAt ?? Infinity,
                maxRank?.observedAt ?? Infinity,
              ),
        stale: Boolean(rankZero?.stale || maxRank?.stale),
        ownedCount: inventory?.get(row.id),
        standingOffers,
      },
    ];
  });
}

function loadLatestPrices(
  sqlite: Database.Database,
  now: number,
): Map<string, Price> {
  const rows = sqlite
    .prepare(
      `with ranked as (
       select snapshot.entity_id as entityId, snapshot.subtype, snapshot.rank,
              snapshot.listing_price as listingPrice,
              snapshot.quick_sale_price as quickSalePrice,
              snapshot.sell_order_count as sellOrderCount,
              snapshot.buy_order_count as buyOrderCount,
              snapshot.observed_at as observedAt,
              row_number() over (partition by snapshot.entity_id, coalesce(snapshot.subtype, ''), coalesce(snapshot.rank, -1)
                order by snapshot.observed_at desc, snapshot.rowid desc) as preference
       from market_price_snapshots snapshot
     ) select * from ranked where preference = 1`,
    )
    .all() as Array<{
    entityId: string;
    subtype: string | null;
    rank: number | null;
    listingPrice: number | null;
    quickSalePrice: number | null;
    sellOrderCount: number;
    buyOrderCount: number;
    observedAt: number;
  }>;
  return new Map(
    rows.map((row) => [
      priceKey(row.entityId, row.subtype, row.rank),
      {
        listing: row.listingPrice ?? undefined,
        quickSale: row.quickSalePrice ?? undefined,
        sellOrderCount: row.sellOrderCount,
        buyOrderCount: row.buyOrderCount,
        observedAt: row.observedAt,
        stale: now - row.observedAt > 36 * 60 * 60_000,
        expired: now - row.observedAt > 7 * 24 * 60 * 60_000,
      },
    ]),
  );
}

function priceValue(
  price: Price | undefined,
  basis: MarketPriceBasis,
): number | undefined {
  if (!price || price.expired) return undefined;
  return basis === "listing" ? price.listing : price.quickSale;
}

function priceKey(
  entityId: string,
  subtype: string | null,
  rank: number | null,
) {
  return `${entityId}\0${subtype ?? ""}\0${rank ?? ""}`;
}

function loadInventory(
  sqlite: Database.Database,
  userId?: string,
): Map<string, number> | undefined {
  if (!userId) return undefined;
  const rows = sqlite
    .prepare(
      `select entity_id as entityId, owned_count as ownedCount from player_inventory where user_id = ?`,
    )
    .all(userId) as Array<{ entityId: string; ownedCount: number }>;
  return new Map(
    rows.map(({ entityId, ownedCount }) => [entityId, ownedCount]),
  );
}
