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
  schemaVersion: 1;
  exportedAt: string;
  inventory: Array<InventoryValues & { entity: PortableEntityReference }>;
}

export interface ProfileImportResult {
  imported: number;
  unresolved: Array<{ index: number; name: string; reason: "missing" | "ambiguous" }>;
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
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    inventory: inventory.map(({ entityId, kind, slug, name, ...values }) => ({
      entity: { externalIds: identifiers.all(entityId) as PortableEntityReference["externalIds"], kind, slug, name },
      ...values,
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
  const resolved: Array<{ entityId: string; values: InventoryValues }> = [];
  const unresolved: ProfileImportResult["unresolved"] = [];

  for (const [index, entry] of profile.inventory.entries()) {
    const candidates = new Set<string>();
    const byExternalId = sqlite.prepare("select entity_id as entityId from external_ids where source_id = ? and namespace = ? and value = ?");
    for (const identifier of entry.entity.externalIds) {
      const match = byExternalId.get(identifier.sourceId, identifier.namespace, identifier.value) as { entityId: string } | undefined;
      if (match) candidates.add(match.entityId);
    }
    if (!candidates.size) {
      const fallback = sqlite.prepare("select id from entities where kind = ? and slug = ? and retired = 0")
        .get(entry.entity.kind, entry.entity.slug) as { id: string } | undefined;
      if (fallback) candidates.add(fallback.id);
    }
    if (candidates.size !== 1) {
      unresolved.push({ index, name: entry.entity.name, reason: candidates.size ? "ambiguous" : "missing" });
      continue;
    }
    resolved.push({ entityId: [...candidates][0]!, values: validateInventoryValues(entry) });
  }

  sqlite.transaction(() => {
    if (options.mode === "replace") sqlite.prepare("delete from player_inventory where user_id = ?").run(userId);
    for (const entry of resolved) setInventoryEntry(sqlite, userId, entry.entityId, entry.values);
  })();
  return { imported: resolved.length, unresolved };
}

function parseProfile(value: unknown): ProfileExport {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.inventory)) throw new Error("Profile must use schemaVersion 1 and contain an inventory array");
  const inventory = value.inventory.map((entry, index) => {
    if (!isRecord(entry) || !isRecord(entry.entity) || !Array.isArray(entry.entity.externalIds)) throw new Error(`Profile inventory entry ${index} is invalid`);
    const entity = entry.entity;
    for (const field of ["kind", "slug", "name"] as const) if (typeof entity[field] !== "string" || !entity[field]) throw new Error(`Profile inventory entry ${index} has invalid entity.${field}`);
    const externalIdValues = entity.externalIds as unknown[];
    const externalIds = externalIdValues.map((identifier) => {
      if (!isRecord(identifier) || typeof identifier.sourceId !== "string" || !identifier.sourceId || typeof identifier.namespace !== "string" || !identifier.namespace || typeof identifier.value !== "string" || !identifier.value) throw new Error(`Profile inventory entry ${index} has an invalid external ID`);
      return { sourceId: identifier.sourceId, namespace: identifier.namespace, value: identifier.value };
    });
    const values = validateInventoryValues(entry);
    return { ...values, entity: { externalIds, kind: entity.kind as string, slug: entity.slug as string, name: entity.name as string } };
  });
  return { schemaVersion: 1, exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "", inventory };
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
