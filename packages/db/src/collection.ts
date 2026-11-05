import type Database from "better-sqlite3";
import {
  deriveCollectionState,
  MASTERY_CAPABLE_KINDS,
  type CollectionState,
} from "@ordis-prime/domain";

export const COLLECTION_ENTITY_KINDS = [
  "warframe",
  "weapon",
  "companion",
  "archwing",
  "vehicle",
  "mod",
  "arcane",
  "shard",
  "relic",
  "blueprint",
  "gear",
  "cosmetic",
  "decoration",
  "misc",
] as const;

export type CollectionFilter =
  | "all"
  | "acquired"
  | "unowned"
  | "mastered"
  | "unmastered"
  | "explicit-wanted"
  | "implicit-wanted";

export type CollectionSort = "name" | "kind" | "state";

export interface PlayerCollectionEntry extends CollectionState {
  entityId: string;
  kind: string;
  slug: string;
  name: string;
  ownedCount: number;
  builtCount: number;
  wantedCount: number;
  mastered?: boolean;
  subsumed?: boolean;
  equipmentMaxRank?: number;
  acquisition: {
    recipes: boolean;
    drops: boolean;
    rotations: boolean;
    vendors: boolean;
    market: boolean;
  };
}

export interface PlayerCollectionPage {
  entries: PlayerCollectionEntry[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  kinds: Array<{ kind: string; count: number }>;
  summary: {
    catalogItems: number;
    acquired: number;
    explicitlyWanted: number;
    implicitlyWanted: number;
    masteryCapable: number;
    mastered: number;
    confirmedUnmastered: number;
    masteryUnknown: number;
  };
}

export interface MasteryHelperComponent {
  entityId: string;
  kind: string;
  slug: string;
  name: string;
  requiredCount: number;
  availableCount: number;
  missingCount: number;
  marketSlug?: string;
  unitPlatinum?: number;
  totalPlatinum?: number;
  priceObservedAt?: number;
  priceStale: boolean;
}

export interface MasteryHelperEntry {
  entityId: string;
  kind: string;
  slug: string;
  name: string;
  ownedCount: number;
  builtCount: number;
  mastered?: boolean;
  recipeId?: string;
  missingComponentCount?: number;
  missingComponentCopies?: number;
  components: MasteryHelperComponent[];
  tradeableMissingComponents: number;
  pricedMissingComponents: number;
  knownPlatinumCost?: number;
  pricesStale: boolean;
}

export interface MasteryHelperPage {
  entries: MasteryHelperEntry[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  kinds: Array<{ kind: string; count: number }>;
}

interface CollectionRow {
  entityId: string;
  kind: string;
  slug: string;
  name: string;
  equipmentMaxRank: number | null;
  ownedCount: number;
  builtCount: number;
  wantedCount: number;
  mastered: number | null;
  subsumed: number | null;
}

export function listPlayerCollection(
  sqlite: Database.Database,
  userId: string,
  input: {
    query?: string;
    kind?: string;
    state?: CollectionFilter;
    sort?: CollectionSort;
    direction?: "asc" | "desc";
    page?: number;
    pageSize?: number;
  } = {},
): PlayerCollectionPage {
  if (!sqlite.prepare("select 1 from users where id = ?").get(userId))
    throw new Error("Unknown user");
  const requestedKind = COLLECTION_ENTITY_KINDS.includes(
    input.kind as (typeof COLLECTION_ENTITY_KINDS)[number],
  )
    ? input.kind
    : undefined;
  const query = input.query?.trim().toLocaleLowerCase() ?? "";
  const rows = sqlite
    .prepare(
      `select entity.id as entityId, entity.kind, entity.slug, entity.name,
              entity.equipment_max_rank as equipmentMaxRank,
              coalesce(inventory.owned_count, 0) as ownedCount,
              coalesce(inventory.built_count, 0) as builtCount,
              coalesce(inventory.wanted_count, 0) as wantedCount,
              inventory.mastered, inventory.subsumed
       from entities entity
       left join player_inventory inventory
         on inventory.entity_id = entity.id and inventory.user_id = ?
       where entity.retired = 0
         and entity.kind in (${COLLECTION_ENTITY_KINDS.map(() => "?").join(", ")})`,
    )
    .all(userId, ...COLLECTION_ENTITY_KINDS) as CollectionRow[];
  const allEntries = rows.map(hydrateCollectionEntry);
  const kinds = [...COLLECTION_ENTITY_KINDS].flatMap((kind) => {
    const count = allEntries.filter((entry) => entry.kind === kind).length;
    return count ? [{ kind, count }] : [];
  });
  const summary = summarize(allEntries);
  const filtered = allEntries.filter((entry) => {
    if (requestedKind && entry.kind !== requestedKind) return false;
    if (query && !entry.name.toLocaleLowerCase().includes(query)) return false;
    return matchesState(entry, input.state ?? "all");
  });
  const direction = input.direction === "desc" ? -1 : 1;
  const sort = input.sort ?? "name";
  filtered.sort((left, right) => {
    let comparison = 0;
    if (sort === "kind") comparison = left.kind.localeCompare(right.kind);
    if (sort === "state") comparison = stateOrder(left) - stateOrder(right);
    if (!comparison) comparison = left.name.localeCompare(right.name);
    if (!comparison) comparison = left.kind.localeCompare(right.kind);
    return comparison * direction;
  });
  const pageSize = Math.max(20, Math.min(200, input.pageSize ?? 100));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.max(1, Math.min(pageCount, input.page ?? 1));
  const pageEntries = filtered.slice((page - 1) * pageSize, page * pageSize);
  applyAcquisitionEvidence(sqlite, pageEntries);
  return {
    entries: pageEntries,
    page,
    pageSize,
    total: filtered.length,
    pageCount,
    kinds,
    summary,
  };
}

export function listMasteryHelper(
  sqlite: Database.Database,
  userId: string,
  input: {
    query?: string;
    kind?: string;
    page?: number;
    pageSize?: number;
    now?: number;
  } = {},
): MasteryHelperPage {
  if (!sqlite.prepare("select 1 from users where id = ?").get(userId))
    throw new Error("Unknown user");
  const itemRows = sqlite
    .prepare(
      `select entity.id as entityId, entity.kind, entity.slug, entity.name,
              coalesce(inventory.owned_count, 0) as ownedCount,
              coalesce(inventory.built_count, 0) as builtCount,
              inventory.mastered
       from entities entity
       left join player_inventory inventory
         on inventory.entity_id = entity.id and inventory.user_id = ?
       where entity.retired = 0
         and entity.kind in (${MASTERY_CAPABLE_KINDS.map(() => "?").join(", ")})
         and coalesce(inventory.mastered, 0) != 1
       order by entity.name collate nocase, entity.kind`,
    )
    .all(userId, ...MASTERY_CAPABLE_KINDS) as Array<{
    entityId: string;
    kind: string;
    slug: string;
    name: string;
    ownedCount: number;
    builtCount: number;
    mastered: number | null;
  }>;
  const recipeRows = sqlite
    .prepare(
      `with ranked_recipes as (
         select recipe.id, recipe.output_id as outputId,
                row_number() over (
                  partition by recipe.output_id
                  order by case
                    when preference.source_id = run.source_id
                     and preference.source_record_key = recipe.source_record_key
                    then 0 else 1 end,
                    source.priority desc, run.retrieved_at desc,
                    source.id, recipe.source_record_key, recipe.id
                ) as preference
         from recipes recipe
         join source_runs run
           on run.id = recipe.source_run_id and run.status = 'active'
         join sources source on source.id = run.source_id
         left join player_recipe_preferences preference
           on preference.user_id = ?
          and preference.output_entity_id = recipe.output_id
       )
       select ranked.id as recipeId, ranked.outputId,
              ingredient.entity_id as entityId, entity.kind, entity.slug,
              entity.name, ingredient.quantity
       from ranked_recipes ranked
       join recipe_ingredients ingredient on ingredient.recipe_id = ranked.id
       join entities entity on entity.id = ingredient.entity_id
       where ranked.preference = 1 and entity.retired = 0
       order by ranked.outputId, entity.name collate nocase, entity.id`,
    )
    .all(userId) as Array<{
    recipeId: string;
    outputId: string;
    entityId: string;
    kind: string;
    slug: string;
    name: string;
    quantity: number;
  }>;
  const inventory = new Map(
    (
      sqlite
        .prepare(
          `select entity_id as entityId,
                  owned_count + built_count as availableCount
           from player_inventory where user_id = ?`,
        )
        .all(userId) as Array<{ entityId: string; availableCount: number }>
    ).map((row) => [row.entityId, row.availableCount]),
  );
  const recipes = new Map<string, typeof recipeRows>();
  for (const row of recipeRows)
    recipes.set(row.outputId, [...(recipes.get(row.outputId) ?? []), row]);
  const missingIds = new Set<string>();
  for (const item of itemRows) {
    if (item.ownedCount + item.builtCount > 0) continue;
    for (const component of recipes.get(item.entityId) ?? [])
      if (component.quantity > (inventory.get(component.entityId) ?? 0))
        missingIds.add(component.entityId);
  }
  const market = loadMasteryMarketData(
    sqlite,
    [...missingIds],
    input.now ?? Date.now(),
  );
  const allEntries = itemRows.map((item): MasteryHelperEntry => {
    const recipe = recipes.get(item.entityId);
    const acquired = item.ownedCount + item.builtCount > 0;
    const components = acquired
      ? []
      : (recipe ?? []).flatMap((component): MasteryHelperComponent[] => {
          const availableCount = inventory.get(component.entityId) ?? 0;
          const missingCount = Math.max(0, component.quantity - availableCount);
          if (!missingCount) return [];
          const price = market.get(component.entityId);
          return [
            {
              entityId: component.entityId,
              kind: component.kind,
              slug: component.slug,
              name: component.name,
              requiredCount: component.quantity,
              availableCount,
              missingCount,
              marketSlug: price?.marketSlug,
              unitPlatinum: price?.unitPlatinum,
              totalPlatinum:
                price?.unitPlatinum === undefined
                  ? undefined
                  : price.unitPlatinum * missingCount,
              priceObservedAt: price?.observedAt,
              priceStale: price?.stale ?? false,
            },
          ];
        });
    const tradeable = components.filter((component) => component.marketSlug);
    const priced = tradeable.filter(
      (component) => component.totalPlatinum !== undefined,
    );
    return {
      entityId: item.entityId,
      kind: item.kind,
      slug: item.slug,
      name: item.name,
      ownedCount: item.ownedCount,
      builtCount: item.builtCount,
      mastered: item.mastered === null ? undefined : item.mastered === 1,
      recipeId: recipe?.[0]?.recipeId,
      missingComponentCount: acquired
        ? 0
        : recipe
          ? components.length
          : undefined,
      missingComponentCopies: acquired
        ? 0
        : recipe
          ? components.reduce(
              (total, component) => total + component.missingCount,
              0,
            )
          : undefined,
      components,
      tradeableMissingComponents: tradeable.length,
      pricedMissingComponents: priced.length,
      knownPlatinumCost: priced.length
        ? priced.reduce(
            (total, component) => total + component.totalPlatinum!,
            0,
          )
        : undefined,
      pricesStale: priced.some((component) => component.priceStale),
    };
  });
  const requestedKind = (MASTERY_CAPABLE_KINDS as readonly string[]).includes(
    input.kind ?? "",
  )
    ? input.kind
    : undefined;
  const query = input.query?.trim().toLocaleLowerCase() ?? "";
  const filtered = allEntries.filter(
    (entry) =>
      (!requestedKind || entry.kind === requestedKind) &&
      (!query || entry.name.toLocaleLowerCase().includes(query)),
  );
  filtered.sort((left, right) => {
    if (left.missingComponentCount === undefined)
      return right.missingComponentCount === undefined
        ? left.name.localeCompare(right.name)
        : 1;
    if (right.missingComponentCount === undefined) return -1;
    return (
      left.missingComponentCount - right.missingComponentCount ||
      (left.missingComponentCopies ?? 0) -
        (right.missingComponentCopies ?? 0) ||
      left.name.localeCompare(right.name)
    );
  });
  const pageSize = Math.max(20, Math.min(200, input.pageSize ?? 100));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.max(1, Math.min(pageCount, input.page ?? 1));
  return {
    entries: filtered.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: filtered.length,
    pageCount,
    kinds: MASTERY_CAPABLE_KINDS.flatMap((kind) => {
      const count = allEntries.filter((entry) => entry.kind === kind).length;
      return count ? [{ kind, count }] : [];
    }),
  };
}

function loadMasteryMarketData(
  sqlite: Database.Database,
  entityIds: string[],
  now: number,
): Map<
  string,
  {
    marketSlug: string;
    unitPlatinum?: number;
    observedAt?: number;
    stale: boolean;
  }
> {
  if (!entityIds.length) return new Map();
  const placeholders = entityIds.map(() => "?").join(", ");
  const rows = sqlite
    .prepare(
      `with ranked_prices as (
         select snapshot.entity_id as entityId,
                snapshot.listing_price as listingPrice,
                snapshot.observed_at as observedAt,
                row_number() over (
                  partition by snapshot.entity_id
                  order by snapshot.observed_at desc, snapshot.rowid desc
                ) as preference
         from market_price_snapshots snapshot
         where snapshot.entity_id in (${placeholders})
           and snapshot.subtype is null and snapshot.rank is null
       )
       select identifier.entity_id as entityId, identifier.value as marketSlug,
              price.listingPrice, price.observedAt
       from external_ids identifier
       left join ranked_prices price
         on price.entityId = identifier.entity_id and price.preference = 1
       where identifier.source_id = 'warframe-market-items'
         and identifier.namespace = 'item-slug'
         and identifier.entity_id in (${placeholders})`,
    )
    .all(...entityIds, ...entityIds) as Array<{
    entityId: string;
    marketSlug: string;
    listingPrice: number | null;
    observedAt: number | null;
  }>;
  return new Map(
    rows.map((row) => {
      const expired =
        row.observedAt === null || now - row.observedAt > 7 * 24 * 60 * 60_000;
      return [
        row.entityId,
        {
          marketSlug: row.marketSlug,
          unitPlatinum:
            expired || row.listingPrice === null ? undefined : row.listingPrice,
          observedAt: row.observedAt ?? undefined,
          stale:
            row.observedAt !== null && now - row.observedAt > 36 * 60 * 60_000,
        },
      ];
    }),
  );
}

function hydrateCollectionEntry(row: CollectionRow): PlayerCollectionEntry {
  const values = {
    kind: row.kind,
    ownedCount: row.ownedCount,
    builtCount: row.builtCount,
    wantedCount: row.wantedCount,
    mastered: row.mastered === null ? undefined : row.mastered === 1,
  };
  return {
    entityId: row.entityId,
    kind: row.kind,
    slug: row.slug,
    name: row.name,
    ownedCount: row.ownedCount,
    builtCount: row.builtCount,
    wantedCount: row.wantedCount,
    mastered: values.mastered,
    subsumed: row.subsumed === null ? undefined : row.subsumed === 1,
    equipmentMaxRank: row.equipmentMaxRank ?? undefined,
    ...deriveCollectionState(values),
    acquisition: {
      recipes: false,
      drops: false,
      rotations: false,
      vendors: false,
      market: false,
    },
  };
}

function applyAcquisitionEvidence(
  sqlite: Database.Database,
  entries: PlayerCollectionEntry[],
): void {
  if (!entries.length) return;
  const ids = entries.map((entry) => entry.entityId);
  const placeholders = ids.map(() => "?").join(", ");
  const activeEntityIds = (
    table: "recipes" | "drops" | "vendor_offerings",
    column: "output_id" | "reward_id" | "item_id",
  ) =>
    new Set(
      (
        sqlite
          .prepare(
            `select distinct fact.${column} as entityId
             from ${table} fact
             join source_runs run on run.id = fact.source_run_id and run.status = 'active'
             where fact.${column} in (${placeholders})`,
          )
          .all(...ids) as Array<{ entityId: string }>
      ).map((row) => row.entityId),
    );
  const recipes = activeEntityIds("recipes", "output_id");
  const drops = activeEntityIds("drops", "reward_id");
  const vendors = activeEntityIds("vendor_offerings", "item_id");
  const market = new Set(
    (
      sqlite
        .prepare(
          `select distinct entity_id as entityId from external_ids
           where source_id = 'warframe-market-items' and namespace = 'item-slug'
             and entity_id in (${placeholders})`,
        )
        .all(...ids) as Array<{ entityId: string }>
    ).map((row) => row.entityId),
  );
  const requested = new Set(ids);
  const rotations = new Set<string>();
  const choiceRows = sqlite
    .prepare(
      `select choice.primary_entity_id as primaryEntityId,
              choice.included_rewards_json as includedRewardsJson
       from cyclic_reward_choices choice
       join cyclic_reward_schedules schedule on schedule.id = choice.schedule_id
       join source_runs run on run.id = schedule.source_run_id and run.status = 'active'`,
    )
    .all() as Array<{
    primaryEntityId: string | null;
    includedRewardsJson: string;
  }>;
  for (const row of choiceRows) {
    if (row.primaryEntityId && requested.has(row.primaryEntityId))
      rotations.add(row.primaryEntityId);
    try {
      const rewards = JSON.parse(row.includedRewardsJson) as unknown;
      if (!Array.isArray(rewards)) continue;
      for (const reward of rewards) {
        if (!reward || typeof reward !== "object") continue;
        const entityId = (reward as { entityId?: unknown }).entityId;
        if (typeof entityId === "string" && requested.has(entityId))
          rotations.add(entityId);
      }
    } catch {
      // Invalid source JSON is ignored here; source validation owns rejection.
    }
  }
  for (const entry of entries)
    entry.acquisition = {
      recipes: recipes.has(entry.entityId),
      drops: drops.has(entry.entityId),
      rotations: rotations.has(entry.entityId),
      vendors: vendors.has(entry.entityId),
      market: market.has(entry.entityId),
    };
}

function matchesState(
  entry: PlayerCollectionEntry,
  state: CollectionFilter,
): boolean {
  if (state === "acquired") return entry.acquired;
  if (state === "unowned") return !entry.acquired;
  if (state === "mastered")
    return entry.masteryCapable && entry.mastered === true;
  if (state === "unmastered")
    return entry.masteryCapable && entry.mastered !== true;
  if (state === "explicit-wanted") return entry.explicitlyWanted;
  if (state === "implicit-wanted") return entry.implicitlyWanted;
  return true;
}

function stateOrder(entry: PlayerCollectionEntry): number {
  if (entry.explicitlyWanted) return 0;
  if (entry.implicitlyWanted) return 1;
  if (!entry.acquired) return 2;
  return 3;
}

function summarize(entries: PlayerCollectionEntry[]) {
  const mastery = entries.filter((entry) => entry.masteryCapable);
  return {
    catalogItems: entries.length,
    acquired: entries.filter((entry) => entry.acquired).length,
    explicitlyWanted: entries.filter((entry) => entry.explicitlyWanted).length,
    implicitlyWanted: entries.filter((entry) => entry.implicitlyWanted).length,
    masteryCapable: mastery.length,
    mastered: mastery.filter((entry) => entry.mastered === true).length,
    confirmedUnmastered: mastery.filter((entry) => entry.mastered === false)
      .length,
    masteryUnknown: mastery.filter((entry) => entry.mastered === undefined)
      .length,
  };
}
