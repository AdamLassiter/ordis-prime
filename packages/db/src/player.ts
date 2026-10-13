import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export interface InventoryValues {
  ownedCount: number;
  builtCount: number;
  wantedCount: number;
  mastered?: boolean;
  subsumed?: boolean;
  note?: string;
}

export interface PlayerInventoryEntry extends InventoryValues {
  entityId: string;
  kind: string;
  slug: string;
  name: string;
}

export function findPlayerInventoryEntry(
  sqlite: Database.Database,
  userId: string,
  kind: string,
  slug: string,
): PlayerInventoryEntry | undefined {
  assertUser(sqlite, userId);
  const row = sqlite.prepare(`
    select entity.id as entityId, entity.kind, entity.slug, entity.name,
           inventory.owned_count as ownedCount, inventory.built_count as builtCount,
           inventory.wanted_count as wantedCount, inventory.mastered, inventory.subsumed,
           inventory.note
    from entities entity
    left join player_inventory inventory on inventory.entity_id = entity.id and inventory.user_id = ?
    where entity.kind = ? and entity.slug = ? and entity.retired = 0
  `).get(userId, kind, slug) as (Omit<PlayerInventoryEntry, "mastered" | "subsumed" | "note"> & { mastered: number | null; subsumed: number | null; note: string | null }) | undefined;
  if (!row) return undefined;
  return {
    ...row,
    ownedCount: row.ownedCount ?? 0,
    builtCount: row.builtCount ?? 0,
    wantedCount: row.wantedCount ?? 0,
    mastered: sqlToBoolean(row.mastered),
    subsumed: sqlToBoolean(row.subsumed),
    note: row.note ?? undefined,
  };
}

export function setInventoryEntryByReference(
  sqlite: Database.Database,
  userId: string,
  reference: { kind: string; slug: string },
  values: InventoryValues,
): void {
  const entity = sqlite.prepare("select id from entities where kind = ? and slug = ? and retired = 0")
    .get(reference.kind, reference.slug) as { id: string } | undefined;
  if (!entity) throw new Error(`Unknown active entity ${reference.kind}:${reference.slug}`);
  setInventoryEntry(sqlite, userId, entity.id, values);
}

export interface PortableEntityReference {
  externalIds: Array<{ sourceId: string; namespace: string; value: string }>;
  kind: string;
  slug: string;
  name: string;
}

export interface ProfileExport {
  schemaVersion: 3;
  exportedAt: string;
  inventory: Array<InventoryValues & { entity: PortableEntityReference }>;
  goals: Array<{ entity: PortableEntityReference; targetQuantity: number }>;
  discoveryProgress: Array<{ entity: PortableEntityReference; state: "discovered" | "completed" }>;
}

export interface ProfileImportResult {
  inventoryImported: number;
  goalsImported: number;
  discoveryProgressImported: number;
  unresolved: Array<{ section: "inventory" | "goals" | "discoveryProgress"; index: number; name: string; reason: "missing" | "ambiguous" }>;
}

export function createLocalUser(
  sqlite: Database.Database,
  input: { username: string; email?: string; role?: "admin" | "player"; id?: string },
): string {
  const username = input.username.trim();
  if (!username || username.length > 80) throw new Error("Username must contain between 1 and 80 characters");
  const id = input.id ?? randomUUID();
  const email = input.email?.trim().toLowerCase() ?? `${id}@local.invalid`;
  const now = Date.now();
  sqlite.prepare("insert into users (id, username, email, email_verified, role, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)")
    .run(id, username, email, 0, input.role ?? "player", now, now);
  return id;
}

export function setInventoryEntry(
  sqlite: Database.Database,
  userId: string,
  entityId: string,
  values: InventoryValues,
): void {
  const normalized = validateInventoryValues(values);
  assertUserAndEntity(sqlite, userId, entityId);
  sqlite.prepare(`
    insert into player_inventory
      (user_id, entity_id, owned_count, built_count, wanted_count, mastered, subsumed, note, updated_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(user_id, entity_id) do update set
      owned_count = excluded.owned_count,
      built_count = excluded.built_count,
      wanted_count = excluded.wanted_count,
      mastered = excluded.mastered,
      subsumed = excluded.subsumed,
      note = excluded.note,
      updated_at = excluded.updated_at
  `).run(userId, entityId, normalized.ownedCount, normalized.builtCount, normalized.wantedCount, booleanToSql(normalized.mastered), booleanToSql(normalized.subsumed), normalized.note ?? null, Date.now());
}

export function listPlayerInventory(sqlite: Database.Database, userId: string): PlayerInventoryEntry[] {
  assertUser(sqlite, userId);
  const rows = sqlite.prepare(`
    select inventory.entity_id as entityId, entity.kind, entity.slug, entity.name,
           inventory.owned_count as ownedCount, inventory.built_count as builtCount,
           inventory.wanted_count as wantedCount, inventory.mastered, inventory.subsumed,
           inventory.note
    from player_inventory inventory
    join entities entity on entity.id = inventory.entity_id
    where inventory.user_id = ?
    order by entity.name collate nocase, entity.kind
  `).all(userId) as Array<Omit<PlayerInventoryEntry, "mastered" | "subsumed" | "note"> & { mastered: number | null; subsumed: number | null; note: string | null }>;
  return rows.map((row) => ({
    ...row,
    mastered: sqlToBoolean(row.mastered),
    subsumed: sqlToBoolean(row.subsumed),
    note: row.note ?? undefined,
  }));
}

export function exportPlayerProfile(sqlite: Database.Database, userId: string): ProfileExport {
  const inventory = listPlayerInventory(sqlite, userId);
  const identifiers = sqlite.prepare(`
    select source_id as sourceId, namespace, value
    from external_ids
    where entity_id = ?
    order by case source_id when 'wfcd-items' then 0 when 'wfcd-drops' then 1 else 2 end,
             source_id, namespace, value
  `);
  return {
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    inventory: inventory.map(({ entityId, kind, slug, name, ...values }) => ({
      entity: { externalIds: identifiers.all(entityId) as PortableEntityReference["externalIds"], kind, slug, name },
      ...values,
    })),
    goals: (sqlite.prepare(`
      select goal.entity_id as entityId, entity.kind, entity.slug, entity.name, goal.target_quantity as targetQuantity
      from player_goals goal join entities entity on entity.id = goal.entity_id
      where goal.user_id = ? order by entity.name collate nocase, entity.kind
    `).all(userId) as Array<{ entityId: string; kind: string; slug: string; name: string; targetQuantity: number }>).map(({ entityId, kind, slug, name, targetQuantity }) => ({
      entity: { externalIds: identifiers.all(entityId) as PortableEntityReference["externalIds"], kind, slug, name },
      targetQuantity,
    })),
    discoveryProgress: (sqlite.prepare(`
      select progress.entity_id as entityId, entity.kind, entity.slug, entity.name, progress.state
      from player_discovery_progress progress join entities entity on entity.id = progress.entity_id
      where progress.user_id = ? order by entity.name collate nocase, entity.kind
    `).all(userId) as Array<{ entityId: string; kind: string; slug: string; name: string; state: "discovered" | "completed" }>).map(({ entityId, kind, slug, name, state }) => ({
      entity: { externalIds: identifiers.all(entityId) as PortableEntityReference["externalIds"], kind, slug, name }, state,
    })),
  };
}

export function importPlayerProfile(
  sqlite: Database.Database,
  userId: string,
  value: unknown,
  options: { mode?: "merge" | "replace" } = {},
): ProfileImportResult {
  assertUser(sqlite, userId);
  const profile = parseProfile(value);
  const resolvedInventory: Array<{ entityId: string; values: InventoryValues }> = [];
  const resolvedGoals: Array<{ entityId: string; targetQuantity: number }> = [];
  const resolvedDiscoveryProgress: Array<{ entityId: string; state: "discovered" | "completed" }> = [];
  const unresolved: ProfileImportResult["unresolved"] = [];

  for (const [index, entry] of profile.inventory.entries()) {
    const resolution = resolvePortableEntity(sqlite, entry.entity);
    if (resolution.reason) {
      unresolved.push({ section: "inventory", index, name: entry.entity.name, reason: resolution.reason });
      continue;
    }
    resolvedInventory.push({ entityId: resolution.entityId!, values: validateInventoryValues(entry) });
  }
  for (const [index, goal] of profile.goals.entries()) {
    const resolution = resolvePortableEntity(sqlite, goal.entity);
    if (resolution.reason) {
      unresolved.push({ section: "goals", index, name: goal.entity.name, reason: resolution.reason });
      continue;
    }
    resolvedGoals.push({ entityId: resolution.entityId!, targetQuantity: goal.targetQuantity });
  }
  for (const [index, progress] of profile.discoveryProgress.entries()) {
    const resolution = resolvePortableEntity(sqlite, progress.entity);
    if (resolution.reason) {
      unresolved.push({ section: "discoveryProgress", index, name: progress.entity.name, reason: resolution.reason });
      continue;
    }
    resolvedDiscoveryProgress.push({ entityId: resolution.entityId!, state: progress.state });
  }

  sqlite.transaction(() => {
    if (options.mode === "replace") {
      sqlite.prepare("delete from player_inventory where user_id = ?").run(userId);
      sqlite.prepare("delete from player_goals where user_id = ?").run(userId);
      sqlite.prepare("delete from player_discovery_progress where user_id = ?").run(userId);
    }
    for (const entry of resolvedInventory) setInventoryEntry(sqlite, userId, entry.entityId, entry.values);
    const writeGoal = sqlite.prepare(`
      insert into player_goals (user_id, entity_id, target_quantity, created_at, updated_at)
      values (?, ?, ?, ?, ?)
      on conflict(user_id, entity_id) do update set target_quantity = excluded.target_quantity, updated_at = excluded.updated_at
    `);
    for (const goal of resolvedGoals) {
      const now = Date.now();
      writeGoal.run(userId, goal.entityId, goal.targetQuantity, now, now);
    }
    const writeProgress = sqlite.prepare(`
      insert into player_discovery_progress (user_id, entity_id, state, updated_at) values (?, ?, ?, ?)
      on conflict(user_id, entity_id) do update set state = excluded.state, updated_at = excluded.updated_at
    `);
    for (const progress of resolvedDiscoveryProgress) writeProgress.run(userId, progress.entityId, progress.state, Date.now());
  })();
  return { inventoryImported: resolvedInventory.length, goalsImported: resolvedGoals.length, discoveryProgressImported: resolvedDiscoveryProgress.length, unresolved };
}

function parseProfile(value: unknown): ProfileExport {
  if (!isRecord(value) || value.schemaVersion !== 3 || !Array.isArray(value.inventory) || !Array.isArray(value.goals) || !Array.isArray(value.discoveryProgress)) throw new Error("Profile must use schemaVersion 3 and contain inventory, goals, and discoveryProgress arrays");
  const inventory = value.inventory.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`Profile inventory entry ${index} is invalid`);
    const entity = parsePortableEntity(entry.entity, `inventory entry ${index}`);
    const values = validateInventoryValues(entry);
    return { ...values, entity };
  });
  const goals = value.goals.map((entry, index) => {
    if (!isRecord(entry) || !Number.isSafeInteger(entry.targetQuantity) || (entry.targetQuantity as number) <= 0) throw new Error(`Profile goal entry ${index} has an invalid targetQuantity`);
    return { entity: parsePortableEntity(entry.entity, `goal entry ${index}`), targetQuantity: entry.targetQuantity as number };
  });
  const discoveryProgress = value.discoveryProgress.map((entry, index) => {
    if (!isRecord(entry) || (entry.state !== "discovered" && entry.state !== "completed")) throw new Error(`Profile discovery progress entry ${index} has an invalid state`);
    return { entity: parsePortableEntity(entry.entity, `discovery progress entry ${index}`), state: entry.state as "discovered" | "completed" };
  });
  return { schemaVersion: 3, exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "", inventory, goals, discoveryProgress };
}

function parsePortableEntity(value: unknown, label: string): PortableEntityReference {
  if (!isRecord(value) || !Array.isArray(value.externalIds)) throw new Error(`Profile ${label} has an invalid entity`);
  for (const field of ["kind", "slug", "name"] as const) if (typeof value[field] !== "string" || !value[field]) throw new Error(`Profile ${label} has invalid entity.${field}`);
  const externalIds = value.externalIds.map((identifier) => {
    if (!isRecord(identifier) || typeof identifier.sourceId !== "string" || !identifier.sourceId || typeof identifier.namespace !== "string" || !identifier.namespace || typeof identifier.value !== "string" || !identifier.value) throw new Error(`Profile ${label} has an invalid external ID`);
    return { sourceId: identifier.sourceId, namespace: identifier.namespace, value: identifier.value };
  });
  return { externalIds, kind: value.kind as string, slug: value.slug as string, name: value.name as string };
}

function resolvePortableEntity(sqlite: Database.Database, entity: PortableEntityReference): { entityId?: string; reason?: "missing" | "ambiguous" } {
  const candidates = new Set<string>();
  const byExternalId = sqlite.prepare("select entity_id as entityId from external_ids where source_id = ? and namespace = ? and value = ?");
  for (const identifier of entity.externalIds) {
    const match = byExternalId.get(identifier.sourceId, identifier.namespace, identifier.value) as { entityId: string } | undefined;
    if (match) candidates.add(match.entityId);
  }
  if (!candidates.size) {
    const fallback = sqlite.prepare("select id from entities where kind = ? and slug = ? and retired = 0").get(entity.kind, entity.slug) as { id: string } | undefined;
    if (fallback) candidates.add(fallback.id);
  }
  return candidates.size === 1 ? { entityId: [...candidates][0]! } : { reason: candidates.size ? "ambiguous" : "missing" };
}

function validateInventoryValues(value: unknown): InventoryValues {
  if (!isRecord(value)) throw new Error("Inventory values must be an object");
  const counts = {} as Pick<InventoryValues, "ownedCount" | "builtCount" | "wantedCount">;
  for (const field of ["ownedCount", "builtCount", "wantedCount"] as const) {
    const count = value[field];
    if (!Number.isSafeInteger(count) || (count as number) < 0) throw new Error(`${field} must be a non-negative safe integer`);
    counts[field] = count as number;
  }
  for (const field of ["mastered", "subsumed"] as const) {
    if (value[field] !== undefined && typeof value[field] !== "boolean") throw new Error(`${field} must be boolean when present`);
  }
  if (value.note !== undefined && (typeof value.note !== "string" || value.note.length > 2_000)) throw new Error("note must be a string of at most 2000 characters");
  return { ...counts, mastered: value.mastered as boolean | undefined, subsumed: value.subsumed as boolean | undefined, note: value.note as string | undefined };
}

function assertUserAndEntity(sqlite: Database.Database, userId: string, entityId: string): void {
  assertUser(sqlite, userId);
  if (!sqlite.prepare("select 1 from entities where id = ?").get(entityId)) throw new Error(`Unknown entity ${entityId}`);
}

function assertUser(sqlite: Database.Database, userId: string): void {
  if (!sqlite.prepare("select 1 from users where id = ?").get(userId)) throw new Error(`Unknown user ${userId}`);
}

function booleanToSql(value: boolean | undefined): number | null {
  return value === undefined ? null : value ? 1 : 0;
}

function sqlToBoolean(value: number | null): boolean | undefined {
  return value === null ? undefined : Boolean(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
