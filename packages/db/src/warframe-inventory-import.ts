import type Database from "better-sqlite3";

const OWNED_ITEM_GROUPS = [
  "Suits",
  "LongGuns",
  "Pistols",
  "Melee",
  "Sentinels",
  "KubrowPets",
  "MoaPets",
  "ZanukaPets",
  "SentinelWeapons",
  "SpaceMelee",
  "SpaceGuns",
  "MechSuits",
  "OperatorAmps",
  "SpaceSuits",
  "Hoverboards",
  "RawUpgrades",
  "MiscItems",
  "Consumables",
  "Recipes",
] as const;

const MAX_RECORDS = 100_000;
const MAX_ITEM_COUNT = 1_000_000;

export interface WarframeInventoryImportResult {
  parsedRecords: number;
  resolvedItems: number;
  changedItems: number;
  unresolvedItemTypes: string[];
  unresolvedCount: number;
}

interface ParsedInventory {
  counts: Map<string, number>;
  subsumed: Set<string>;
  parsedRecords: number;
}

export function parseWarframeInventory(raw: unknown): ParsedInventory {
  if (!isRecord(raw))
    throw new Error("Warframe inventory must be a JSON object");
  const counts = new Map<string, number>();
  let parsedRecords = 0;
  let presentGroups = 0;
  for (const group of OWNED_ITEM_GROUPS) {
    const value = raw[group];
    if (value === undefined) continue;
    presentGroups += 1;
    if (!Array.isArray(value))
      throw new Error(`Warframe inventory ${group} must be an array`);
    for (const [index, entry] of value.entries()) {
      parsedRecords += 1;
      if (parsedRecords > MAX_RECORDS)
        throw new Error(`Warframe inventory exceeds ${MAX_RECORDS} records`);
      if (!isRecord(entry) || !isItemType(entry.ItemType))
        throw new Error(`Warframe inventory ${group}[${index}] is invalid`);
      const quantity = itemQuantity(entry.ItemCount, group, index);
      if (quantity === 0) continue;
      counts.set(entry.ItemType, (counts.get(entry.ItemType) ?? 0) + quantity);
      if (counts.get(entry.ItemType)! > MAX_ITEM_COUNT)
        throw new Error(
          `Warframe inventory quantity exceeds ${MAX_ITEM_COUNT}`,
        );
    }
  }
  if (presentGroups === 0)
    throw new Error("Warframe inventory contains no supported item groups");

  const subsumed = new Set<string>();
  const foundry = raw.InfestedFoundry;
  if (foundry !== undefined) {
    if (!isRecord(foundry))
      throw new Error("Warframe inventory InfestedFoundry is invalid");
    const consumedSuits = foundry.ConsumedSuits ?? [];
    if (!Array.isArray(consumedSuits))
      throw new Error("Warframe inventory InfestedFoundry is invalid");
    for (const [index, entry] of consumedSuits.entries()) {
      parsedRecords += 1;
      if (parsedRecords > MAX_RECORDS)
        throw new Error(`Warframe inventory exceeds ${MAX_RECORDS} records`);
      if (!isRecord(entry) || !isItemType(entry.s))
        throw new Error(
          `Warframe inventory InfestedFoundry.ConsumedSuits[${index}] is invalid`,
        );
      subsumed.add(entry.s);
    }
  }
  return { counts, subsumed, parsedRecords };
}

export function importWarframeInventory(
  sqlite: Database.Database,
  userId: string,
  raw: unknown,
): WarframeInventoryImportResult {
  const parsed = parseWarframeInventory(raw);
  if (!sqlite.prepare("select 1 from users where id = ?").get(userId))
    throw new Error("Unknown user");
  const resolve = sqlite.prepare(`
    select entity.id
    from external_ids identifier
    join entities entity on entity.id = identifier.entity_id
    where identifier.source_id = 'wfcd-items'
      and identifier.namespace = 'uniqueName'
      and identifier.value = ?
      and entity.retired = 0
  `);
  const existing = sqlite.prepare(
    "select owned_count as ownedCount, subsumed from player_inventory where user_id = ? and entity_id = ?",
  );
  const write = sqlite.prepare(`
    insert into player_inventory
      (user_id, entity_id, owned_count, built_count, wanted_count, mastered, subsumed, note, updated_at)
    values (?, ?, ?, 0, 0, null, ?, null, ?)
    on conflict(user_id, entity_id) do update set
      owned_count = max(player_inventory.owned_count, excluded.owned_count),
      subsumed = case when excluded.subsumed = 1 then 1 else player_inventory.subsumed end,
      updated_at = excluded.updated_at
  `);
  const paths = new Set([...parsed.counts.keys(), ...parsed.subsumed]);
  const unresolved: string[] = [];
  let resolvedItems = 0;
  let changedItems = 0;
  sqlite.transaction(() => {
    for (const itemType of paths) {
      const entity = resolve.get(itemType) as { id: string } | undefined;
      if (!entity) {
        unresolved.push(itemType);
        continue;
      }
      resolvedItems += 1;
      const row = existing.get(userId, entity.id) as
        { ownedCount: number; subsumed: number | null } | undefined;
      const quantity = parsed.counts.get(itemType) ?? 0;
      const subsumed = parsed.subsumed.has(itemType);
      if (
        !row ||
        quantity > row.ownedCount ||
        (subsumed && row.subsumed !== 1)
      ) {
        write.run(userId, entity.id, quantity, subsumed ? 1 : null, Date.now());
        changedItems += 1;
      }
    }
  })();
  unresolved.sort();
  return {
    parsedRecords: parsed.parsedRecords,
    resolvedItems,
    changedItems,
    unresolvedItemTypes: unresolved.slice(0, 20),
    unresolvedCount: unresolved.length,
  };
}

function itemQuantity(value: unknown, group: string, index: number): number {
  if (value === undefined) return 1;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > MAX_ITEM_COUNT
  )
    throw new Error(
      `Warframe inventory ${group}[${index}].ItemCount is invalid`,
    );
  return value as number;
}

function isItemType(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/Lotus/") &&
    value.length <= 500
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
