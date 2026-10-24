import { randomUUID } from "node:crypto";
import type { openSqliteDatabase } from "@ordis-prime/db";

type MarketDatabase = ReturnType<typeof openSqliteDatabase>;

const MARKET_ORDERS_URL = "https://api.warframe.market/v2/orders/item";
const USER_AGENT =
  "OrdisPrime/0.1 (+https://gitea-infra.lassiter.uk/adaml/ordis-prime)";

interface Target {
  runId: string;
  entityId: string;
  itemId: string;
  slug: string;
  kind: string;
}

interface Variant {
  subtype: string | null;
  rank: number | null;
}

export async function refreshMarketPriceBatch(input: {
  database: MarketDatabase;
  fetchImpl?: typeof fetch;
  now?: number;
  batchSize?: number;
  requestDelayMilliseconds?: number;
  signal?: AbortSignal;
}): Promise<{
  runId: string;
  complete: boolean;
  completed: number;
  failed: number;
  targetCount: number;
}> {
  const now = input.now ?? Date.now();
  const fetchImpl = input.fetchImpl ?? fetch;
  const batchSize = input.batchSize ?? 60;
  const delayMilliseconds = input.requestDelayMilliseconds ?? 500;
  const runId = ensurePriceRun(input.database, now);
  const targets = input.database
    .prepare(
      `select target.run_id as runId, target.entity_id as entityId,
              target.item_id as itemId, target.slug, entity.kind
       from market_price_targets target
       join entities entity on entity.id = target.entity_id
       where target.run_id = ? and target.status = 'pending'
       order by target.slug limit ?`,
    )
    .all(runId, batchSize) as Target[];

  for (const [index, target] of targets.entries()) {
    if (input.signal?.aborted) throw input.signal.reason;
    if (index > 0 && delayMilliseconds > 0)
      await delay(delayMilliseconds, input.signal);
    try {
      const response = await fetchImpl(
        `${MARKET_ORDERS_URL}/${encodeURIComponent(target.slug)}`,
        {
          signal: input.signal,
          headers: {
            Accept: "application/json",
            Language: "en",
            Platform: "pc",
            Crossplay: "true",
            "User-Agent": USER_AGENT,
          },
        },
      );
      if (!response.ok) throw new Error(`upstream status ${response.status}`);
      const orders = parseOrders(await response.json());
      const variants = expectedVariants(input.database, target);
      input.database.transaction(() => {
        for (const variant of variants) {
          const summary = summarizeVariant(orders, variant);
          input.database
            .prepare(
              `insert into market_price_snapshots
                (id, run_id, entity_id, item_id, slug, subtype, rank,
                 observed_at, listing_price, quick_sale_price,
                 sell_order_count, buy_order_count)
               values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              randomUUID(),
              runId,
              target.entityId,
              target.itemId,
              target.slug,
              variant.subtype,
              variant.rank,
              now,
              summary.listingPrice,
              summary.quickSalePrice,
              summary.sellOrderCount,
              summary.buyOrderCount,
            );
        }
        input.database
          .prepare(
            "update market_price_targets set status = 'succeeded', error = null where run_id = ? and entity_id = ?",
          )
          .run(runId, target.entityId);
      })();
    } catch (error) {
      input.database
        .prepare(
          "update market_price_targets set status = 'failed', error = ? where run_id = ? and entity_id = ?",
        )
        .run(
          error instanceof Error ? error.message.slice(0, 500) : String(error),
          runId,
          target.entityId,
        );
    }
  }

  const counts = input.database
    .prepare(
      `select count(*) as targetCount,
              coalesce(sum(case when status = 'succeeded' then 1 else 0 end), 0) as completed,
              coalesce(sum(case when status = 'failed' then 1 else 0 end), 0) as failed,
              coalesce(sum(case when status = 'pending' then 1 else 0 end), 0) as pending
       from market_price_targets where run_id = ?`,
    )
    .get(runId) as {
    targetCount: number;
    completed: number;
    failed: number;
    pending: number;
  };
  const complete = counts.pending === 0;
  input.database
    .prepare(
      `update market_price_runs set completed_count = ?, failed_count = ?,
        status = ?, finished_at = ? where id = ?`,
    )
    .run(
      counts.completed,
      counts.failed,
      complete ? (counts.failed ? "partial" : "succeeded") : "running",
      complete ? now : null,
      runId,
    );
  return { runId, complete, ...counts };
}

function ensurePriceRun(database: MarketDatabase, now: number): string {
  const existing = database
    .prepare(
      "select id from market_price_runs where status = 'running' order by started_at limit 1",
    )
    .get() as { id: string } | undefined;
  if (existing) return existing.id;
  const targets = database
    .prepare(
      `select entity.id as entityId,
              max(case when identifier.namespace = 'item-id' then identifier.value end) as itemId,
              max(case when identifier.namespace = 'item-slug' then identifier.value end) as slug
       from entities entity
       join external_ids identifier on identifier.entity_id = entity.id
         and identifier.source_id = 'warframe-market-items'
         and identifier.namespace in ('item-id', 'item-slug')
       where entity.retired = 0 and (
         entity.kind in ('relic', 'arcane')
         or exists (
           select 1 from relic_rewards reward
           join source_runs run on run.id = reward.source_run_id and run.status = 'active'
           where reward.reward_id = entity.id
         )
         or (entity.kind = 'mod' and exists (
           select 1 from vendor_offerings offering
           join source_runs run on run.id = offering.source_run_id and run.status = 'active'
           where offering.item_id = entity.id and offering.currency = 'Standing'
         ))
       )
       group by entity.id having itemId is not null and slug is not null
       order by slug`,
    )
    .all() as Array<{ entityId: string; itemId: string; slug: string }>;
  const runId = randomUUID();
  database.transaction(() => {
    database
      .prepare(
        `insert into market_price_runs
          (id, status, started_at, target_count, completed_count, failed_count)
         values (?, 'running', ?, ?, 0, 0)`,
      )
      .run(runId, now, targets.length);
    const insert = database.prepare(
      `insert into market_price_targets
        (run_id, entity_id, item_id, slug, status)
       values (?, ?, ?, ?, 'pending')`,
    );
    for (const target of targets)
      insert.run(runId, target.entityId, target.itemId, target.slug);
  })();
  return runId;
}

function expectedVariants(database: MarketDatabase, target: Target): Variant[] {
  const attributes = database
    .prepare(
      `select attribute.key, attribute.value from entity_attributes attribute
       join source_runs run on run.id = attribute.source_run_id and run.status = 'active'
       where attribute.entity_id = ? and attribute.key in ('market-subtypes', 'market-max-rank')
       order by run.retrieved_at desc`,
    )
    .all(target.entityId) as Array<{ key: string; value: string }>;
  if (target.kind === "relic") {
    const raw = attributes.find(({ key }) => key === "market-subtypes")?.value;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const subtypes = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
    return (
      subtypes.length
        ? subtypes
        : ["intact", "exceptional", "flawless", "radiant"]
    ).map((subtype) => ({ subtype, rank: null }));
  }
  if (target.kind === "arcane") {
    const maxRank = Number(
      attributes.find(({ key }) => key === "market-max-rank")?.value ?? 5,
    );
    return [...new Set([0, maxRank])].map((rank) => ({ subtype: null, rank }));
  }
  if (target.kind === "mod") return [{ subtype: null, rank: 0 }];
  return [{ subtype: null, rank: null }];
}

interface ParsedOrder {
  type: "sell" | "buy";
  price: number;
  subtype: string | null;
  rank: number | null;
}

export function parseOrders(value: unknown): ParsedOrder[] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Warframe.market response is invalid");
  const payload = value as Record<string, unknown>;
  if (payload.error || !Array.isArray(payload.data))
    throw new Error("Warframe.market response has no order array");
  return payload.data.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const order = raw as Record<string, unknown>;
    const user = order.user;
    if (!user || typeof user !== "object" || Array.isArray(user)) return [];
    const status = (user as Record<string, unknown>).status;
    if (status !== "online" && status !== "ingame") return [];
    if (
      order.visible === false ||
      (order.type !== "sell" && order.type !== "buy")
    )
      return [];
    if (!Number.isSafeInteger(order.platinum) || (order.platinum as number) < 1)
      return [];
    const perTrade = order.perTrade === undefined ? 1 : order.perTrade;
    if (!Number.isSafeInteger(perTrade) || (perTrade as number) < 1) return [];
    const rank = order.rank === undefined ? null : order.rank;
    if (rank !== null && (!Number.isSafeInteger(rank) || (rank as number) < 0))
      return [];
    return [
      {
        type: order.type,
        price: (order.platinum as number) / (perTrade as number),
        subtype: typeof order.subtype === "string" ? order.subtype : null,
        rank: rank as number | null,
      },
    ];
  });
}

export function summarizeVariant(orders: ParsedOrder[], variant: Variant) {
  const matching = orders.filter(
    (order) => order.subtype === variant.subtype && order.rank === variant.rank,
  );
  const sells = matching
    .filter(({ type }) => type === "sell")
    .map(({ price }) => price)
    .sort((left, right) => left - right);
  const buys = matching
    .filter(({ type }) => type === "buy")
    .map(({ price }) => price)
    .sort((left, right) => right - left);
  const sample = sells.slice(0, 5);
  const middle = Math.floor(sample.length / 2);
  const listingPrice = sample.length
    ? sample.length % 2
      ? sample[middle]!
      : (sample[middle - 1]! + sample[middle]!) / 2
    : null;
  return {
    listingPrice,
    quickSalePrice: buys[0] ?? null,
    sellOrderCount: sells.length,
    buyOrderCount: buys.length,
  };
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    signal?.addEventListener("abort", aborted, { once: true });
    function done() {
      signal?.removeEventListener("abort", aborted);
      resolve();
    }
    function aborted() {
      clearTimeout(timer);
      reject(signal?.reason);
    }
  });
}

export function pruneMarketPriceHistory(
  database: MarketDatabase,
  retainRuns = 30,
): number {
  const runs = database
    .prepare(
      `select id from market_price_runs where status != 'running'
       order by finished_at desc limit -1 offset ?`,
    )
    .all(retainRuns) as Array<{ id: string }>;
  return database.transaction(() => {
    let changes = 0;
    for (const { id } of runs) {
      changes += database
        .prepare("delete from market_price_snapshots where run_id = ?")
        .run(id).changes;
      changes += database
        .prepare("delete from market_price_targets where run_id = ?")
        .run(id).changes;
      changes += database
        .prepare("delete from market_price_runs where id = ?")
        .run(id).changes;
    }
    return changes;
  })();
}
