import { randomBytes, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export const BUILD_SLOTS = ["warframe", "primary", "secondary", "melee", "companion", "companion-weapon", "archwing", "archgun", "archmelee", "operator-amp"] as const;
export type BuildSlot = typeof BUILD_SLOTS[number];

export interface BuildEntityReference { kind: string; slug: string; name: string }
export interface BuildMod { position: number; entity: BuildEntityReference; rank?: number }
export interface BuildEquipmentEntry { id: string; slot: BuildSlot; entity: BuildEntityReference; notes?: string; mods: BuildMod[] }
export interface PlayerBuild {
  id: string;
  title: string;
  category?: string;
  notes?: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  equipment: BuildEquipmentEntry[];
}
export interface SharedBuildSnapshot extends Omit<PlayerBuild, "id" | "createdAt" | "updatedAt"> {
  shareKey: string;
  sharedAt: number;
}
export type BuildCandidate = BuildEntityReference;

export function createPlayerBuild(sqlite: Database.Database, userId: string, input: { title: string; category?: string; notes?: string }): string {
  assertUser(sqlite, userId);
  const details = validateDetails(input);
  const id = randomUUID();
  const now = Date.now();
  sqlite.prepare("insert into player_builds (id, user_id, title, category, notes, revision, created_at, updated_at) values (?, ?, ?, ?, ?, 1, ?, ?)")
    .run(id, userId, details.title, details.category ?? null, details.notes ?? null, now, now);
  return id;
}

export function listPlayerBuilds(sqlite: Database.Database, userId: string): PlayerBuild[] {
  assertUser(sqlite, userId);
  const ids = sqlite.prepare("select id from player_builds where user_id = ? order by updated_at desc, title collate nocase").all(userId) as Array<{ id: string }>;
  return ids.map(({ id }) => getPlayerBuild(sqlite, userId, id)!);
}

export function getPlayerBuild(sqlite: Database.Database, userId: string, buildId: string): PlayerBuild | undefined {
  const build = sqlite.prepare("select id, title, category, notes, revision, created_at as createdAt, updated_at as updatedAt from player_builds where id = ? and user_id = ?")
    .get(buildId, userId) as { id: string; title: string; category: string | null; notes: string | null; revision: number; createdAt: number; updatedAt: number } | undefined;
  if (!build) return undefined;
  return hydrateBuild(sqlite, build);
}

export function updatePlayerBuild(sqlite: Database.Database, userId: string, buildId: string, input: { title: string; category?: string; notes?: string }): void {
  const details = validateDetails(input);
  const result = sqlite.prepare("update player_builds set title = ?, category = ?, notes = ?, revision = revision + 1, updated_at = ? where id = ? and user_id = ?")
    .run(details.title, details.category ?? null, details.notes ?? null, Date.now(), buildId, userId);
  if (result.changes !== 1) throw new Error("Build not found");
}

export function deletePlayerBuild(sqlite: Database.Database, userId: string, buildId: string): void {
  const result = sqlite.prepare("delete from player_builds where id = ? and user_id = ?").run(buildId, userId);
  if (result.changes !== 1) throw new Error("Build not found");
}

export function searchBuildCandidates(sqlite: Database.Database, slot: BuildSlot | "mod", query: string, limit = 20): BuildCandidate[] {
  if (slot !== "mod" && !(BUILD_SLOTS as readonly string[]).includes(slot)) throw new Error("Build slot is invalid");
  const kind = slot === "mod" ? "mod" : slot === "warframe" ? "warframe" : slot === "companion" ? "companion" : "weapon";
  const normalizedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return sqlite.prepare(`
    select kind, slug, name from entities
    where retired = 0 and kind = ? and name like ? escape '\\'
    order by case when lower(name) = lower(?) then 0 else 1 end, name collate nocase
    limit ?
  `).all(kind, `%${escapeLike(query.trim())}%`, query.trim(), normalizedLimit) as BuildCandidate[];
}

export function setBuildEquipment(sqlite: Database.Database, userId: string, buildId: string, slot: BuildSlot, reference: { kind: string; slug: string }, notes?: string): void {
  if (!(BUILD_SLOTS as readonly string[]).includes(slot)) throw new Error("Build slot is invalid");
  const normalizedNotes = normalizeText(notes, 2_000, "Equipment notes");
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const entity = findEntity(sqlite, reference);
    const expectedKind = slot === "warframe" ? "warframe" : slot === "companion" ? "companion" : "weapon";
    if (entity.kind !== expectedKind) throw new Error(`${slot} requires a ${expectedKind}, not ${entity.kind}`);
    const existing = sqlite.prepare("select id, entity_id as entityId from build_equipment where build_id = ? and slot = ?").get(buildId, slot) as { id: string; entityId: string } | undefined;
    if (existing) {
      if (existing.entityId !== entity.id) sqlite.prepare("delete from build_mods where equipment_id = ?").run(existing.id);
      sqlite.prepare("update build_equipment set entity_id = ?, notes = ? where id = ?").run(entity.id, normalizedNotes ?? null, existing.id);
    } else {
      sqlite.prepare("insert into build_equipment (id, build_id, slot, entity_id, notes) values (?, ?, ?, ?, ?)").run(randomUUID(), buildId, slot, entity.id, normalizedNotes ?? null);
    }
    touchBuild(sqlite, buildId);
  })();
}

export function removeBuildEquipment(sqlite: Database.Database, userId: string, buildId: string, slot: BuildSlot): void {
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const result = sqlite.prepare("delete from build_equipment where build_id = ? and slot = ?").run(buildId, slot);
    if (result.changes !== 1) throw new Error("Build equipment not found");
    touchBuild(sqlite, buildId);
  })();
}

export function setBuildMod(sqlite: Database.Database, userId: string, buildId: string, slot: BuildSlot, position: number, reference: { kind: string; slug: string }, rank?: number): void {
  if (!Number.isSafeInteger(position) || position < 0 || position > 19) throw new Error("Mod position must be between 0 and 19");
  if (rank !== undefined && (!Number.isSafeInteger(rank) || rank < 0 || rank > 100)) throw new Error("Mod rank must be between 0 and 100");
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const equipment = sqlite.prepare("select id from build_equipment where build_id = ? and slot = ?").get(buildId, slot) as { id: string } | undefined;
    if (!equipment) throw new Error("Add equipment before assigning its mods");
    const mod = findEntity(sqlite, reference);
    if (mod.kind !== "mod") throw new Error(`Mod slot requires a mod, not ${mod.kind}`);
    sqlite.prepare(`
      insert into build_mods (id, equipment_id, position, entity_id, rank) values (?, ?, ?, ?, ?)
      on conflict(equipment_id, position) do update set entity_id = excluded.entity_id, rank = excluded.rank
    `).run(randomUUID(), equipment.id, position, mod.id, rank ?? null);
    touchBuild(sqlite, buildId);
  })();
}

export function removeBuildMod(sqlite: Database.Database, userId: string, buildId: string, slot: BuildSlot, position: number): void {
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const result = sqlite.prepare("delete from build_mods where equipment_id in (select id from build_equipment where build_id = ? and slot = ?) and position = ?").run(buildId, slot, position);
    if (result.changes !== 1) throw new Error("Build mod not found");
    touchBuild(sqlite, buildId);
  })();
}

export function createBuildShare(sqlite: Database.Database, userId: string, buildId: string): string {
  const build = getPlayerBuild(sqlite, userId, buildId);
  if (!build) throw new Error("Build not found");
  const shareKey = randomBytes(18).toString("base64url");
  const sharedAt = Date.now();
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...snapshot } = build;
  sqlite.prepare("insert into build_share_snapshots (id, share_key, source_build_id, revision, title, snapshot_json, created_at) values (?, ?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), shareKey, buildId, build.revision, build.title, JSON.stringify({ ...snapshot, shareKey, sharedAt }), sharedAt);
  return shareKey;
}

export function findSharedBuild(sqlite: Database.Database, shareKey: string): SharedBuildSnapshot | undefined {
  const row = sqlite.prepare("select snapshot_json as snapshotJson from build_share_snapshots where share_key = ?").get(shareKey) as { snapshotJson: string } | undefined;
  if (!row) return undefined;
  return JSON.parse(row.snapshotJson) as SharedBuildSnapshot;
}

function hydrateBuild(sqlite: Database.Database, build: { id: string; title: string; category: string | null; notes: string | null; revision: number; createdAt: number; updatedAt: number }): PlayerBuild {
  const equipmentRows = sqlite.prepare(`
    select equipment.id, equipment.slot, equipment.notes, entity.kind, entity.slug, entity.name
    from build_equipment equipment join entities entity on entity.id = equipment.entity_id
    where equipment.build_id = ? order by equipment.slot
  `).all(build.id) as Array<{ id: string; slot: BuildSlot; notes: string | null; kind: string; slug: string; name: string }>;
  const modsQuery = sqlite.prepare(`
    select mod.position, mod.rank, entity.kind, entity.slug, entity.name
    from build_mods mod join entities entity on entity.id = mod.entity_id
    where mod.equipment_id = ? order by mod.position
  `);
  return {
    id: build.id, title: build.title, category: build.category ?? undefined, notes: build.notes ?? undefined,
    revision: build.revision, createdAt: build.createdAt, updatedAt: build.updatedAt,
    equipment: equipmentRows.map((entry) => ({ id: entry.id, slot: entry.slot, entity: { kind: entry.kind, slug: entry.slug, name: entry.name }, notes: entry.notes ?? undefined, mods: (modsQuery.all(entry.id) as Array<{ position: number; rank: number | null; kind: string; slug: string; name: string }>).map(({ position, rank, kind, slug, name }) => ({ position, rank: rank ?? undefined, entity: { kind, slug, name } })) })),
  };
}

function validateDetails(input: { title: string; category?: string; notes?: string }) {
  const title = input.title.trim();
  if (!title || title.length > 160) throw new Error("Build title must contain between 1 and 160 characters");
  return { title, category: normalizeText(input.category, 80, "Build category"), notes: normalizeText(input.notes, 10_000, "Build notes") };
}
function normalizeText(value: string | undefined, maximum: number, label: string): string | undefined { const text = value?.trim() || undefined; if (text && text.length > maximum) throw new Error(`${label} cannot exceed ${maximum} characters`); return text; }
function assertUser(sqlite: Database.Database, userId: string): void { if (!sqlite.prepare("select 1 from users where id = ?").get(userId)) throw new Error("Unknown user"); }
function assertBuildOwner(sqlite: Database.Database, userId: string, buildId: string): void { if (!sqlite.prepare("select 1 from player_builds where id = ? and user_id = ?").get(buildId, userId)) throw new Error("Build not found"); }
function findEntity(sqlite: Database.Database, reference: { kind: string; slug: string }): { id: string; kind: string } { const entity = sqlite.prepare("select id, kind from entities where kind = ? and slug = ? and retired = 0").get(reference.kind, reference.slug) as { id: string; kind: string } | undefined; if (!entity) throw new Error(`Unknown active entity ${reference.kind}:${reference.slug}`); return entity; }
function touchBuild(sqlite: Database.Database, buildId: string): void { sqlite.prepare("update player_builds set revision = revision + 1, updated_at = ? where id = ?").run(Date.now(), buildId); }
function escapeLike(value: string): string { return value.replace(/[\\%_]/g, "\\$&"); }
