import type Database from "better-sqlite3";
import {
  deriveCollectionState,
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
