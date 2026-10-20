import { randomBytes, randomUUID } from "node:crypto";
import {
  MOD_POLARITIES,
  type ArcaneClass,
  type ModPolarity,
  type WeaponClass,
} from "@ordis-prime/domain";
import type Database from "better-sqlite3";
import {
  listEquipmentPolaritySetsByEntityId,
  type CatalogEquipmentPolaritySet,
} from "./catalog.ts";

/*
 * Slot state belongs to the equipment grid, not to an installed mod. Keeping it
 * separate preserves an empty Forma'd slot and lets mods move without rewriting
 * the equipment configuration.
 */
export const BUILD_MOD_SLOT_ROLES = [
  "normal",
  "aura",
  "stance",
  "exilus",
] as const;
export const BUILD_MOD_SLOT_POLARITIES = MOD_POLARITIES.filter(
  (polarity): polarity is Exclude<ModPolarity, "universal"> =>
    polarity !== "universal",
);
export type BuildModSlotRole = (typeof BUILD_MOD_SLOT_ROLES)[number];
export interface BuildModSlot {
  position: number;
  role: BuildModSlotRole;
  polarity?: ModPolarity;
}

export const BUILD_SLOTS = [
  "warframe",
  "primary",
  "secondary",
  "melee",
  "companion",
  "companion-weapon",
  "archwing",
  "archgun",
  "archmelee",
  "operator-amp",
] as const;
export type BuildSlot = (typeof BUILD_SLOTS)[number];
export function buildModSlotRolesFor(slot: BuildSlot): BuildModSlotRole[] {
  return BUILD_MOD_SLOT_ROLES.filter(
    (role) =>
      role === "normal" ||
      role === "exilus" ||
      (role === "aura" && slot === "warframe") ||
      (role === "stance" && slot === "melee"),
  );
}
export const BUILD_ENHANCEMENT_SLOTS = [
  "warframe-arcane-1",
  "warframe-arcane-2",
  "operator-arcane-1",
  "operator-arcane-2",
  "amp-arcane-1",
  "amp-arcane-2",
  "primary-arcane",
  "secondary-arcane",
  "melee-arcane",
  "archon-shard-1",
  "archon-shard-2",
  "archon-shard-3",
  "archon-shard-4",
  "archon-shard-5",
] as const;
export type BuildEnhancementSlot = (typeof BUILD_ENHANCEMENT_SLOTS)[number];

export interface BuildEntityReference {
  kind: string;
  slug: string;
  name: string;
}
export interface BuildMod {
  position: number;
  entity: BuildEntityReference;
  rank?: number;
  maxRank?: number;
  baseDrain?: number;
  polarity?: ModPolarity;
  drain?: number;
  adjustedDrain?: number;
}
export interface BuildCapacity {
  base?: number;
  bonus?: number;
  total?: number;
  drain?: number;
  remaining?: number;
}
export interface BuildEquipmentEntry {
  id: string;
  slot: BuildSlot;
  entity: BuildEntityReference;
  notes?: string;
  configuration?: string;
  rank?: number;
  maxRank?: number;
  formaCount: number;
  capacityUpgrade: boolean;
  capacity?: BuildCapacity;
  factoryPolaritySets?: CatalogEquipmentPolaritySet[];
  modSlots: BuildModSlot[];
  mods: BuildMod[];
}
export interface BuildEnhancementOption {
  key: string;
  label: string;
  sourceName: string;
  citationUrl?: string;
}
export interface BuildEnhancement {
  slot: BuildEnhancementSlot;
  entity: BuildEntityReference;
  rank?: number;
  option?: { key: string; label: string; available: boolean };
}
export interface PlayerBuild {
  id: string;
  title: string;
  category?: string;
  notes?: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  equipment: BuildEquipmentEntry[];
  enhancements: BuildEnhancement[];
}
export interface SharedBuildSnapshot extends Omit<
  PlayerBuild,
  "id" | "createdAt" | "updatedAt"
> {
  shareKey: string;
  sharedAt: number;
}
export interface BuildShareSummary {
  shareKey: string;
  revision: number;
  createdAt: number;
}
export type BuildCandidate = BuildEntityReference & {
  arcaneClass?: ArcaneClass;
  weaponClass?: WeaponClass;
  equipmentMaxRank?: number;
  modMaxRank?: number;
  modBaseDrain?: number;
  modPolarity?: ModPolarity;
  enhancementOptions?: BuildEnhancementOption[];
};

export function createPlayerBuild(
  sqlite: Database.Database,
  userId: string,
  input: { title: string; category?: string; notes?: string },
): string {
  assertUser(sqlite, userId);
  const details = validateDetails(input);
  const id = randomUUID();
  const now = Date.now();
  sqlite
    .prepare(
      "insert into player_builds (id, user_id, title, category, notes, revision, created_at, updated_at) values (?, ?, ?, ?, ?, 1, ?, ?)",
    )
    .run(
      id,
      userId,
      details.title,
      details.category ?? null,
      details.notes ?? null,
      now,
      now,
    );
  return id;
}

export function listPlayerBuilds(
  sqlite: Database.Database,
  userId: string,
): PlayerBuild[] {
  assertUser(sqlite, userId);
  const ids = sqlite
    .prepare(
      "select id from player_builds where user_id = ? order by updated_at desc, title collate nocase",
    )
    .all(userId) as Array<{ id: string }>;
  return ids.map(({ id }) => getPlayerBuild(sqlite, userId, id)!);
}

export function getPlayerBuild(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
): PlayerBuild | undefined {
  const build = sqlite
    .prepare(
      "select id, title, category, notes, revision, created_at as createdAt, updated_at as updatedAt from player_builds where id = ? and user_id = ?",
    )
    .get(buildId, userId) as
    | {
        id: string;
        title: string;
        category: string | null;
        notes: string | null;
        revision: number;
        createdAt: number;
        updatedAt: number;
      }
    | undefined;
  if (!build) return undefined;
  const player = sqlite
    .prepare(
      "select mastery_rank as masteryRank from player_profiles where user_id = ?",
    )
    .get(userId) as { masteryRank: number | null } | undefined;
  return hydrateBuild(sqlite, build, player?.masteryRank ?? undefined);
}

export function updatePlayerBuild(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
  input: { title: string; category?: string; notes?: string },
): void {
  const details = validateDetails(input);
  const result = sqlite
    .prepare(
      "update player_builds set title = ?, category = ?, notes = ?, revision = revision + 1, updated_at = ? where id = ? and user_id = ?",
    )
    .run(
      details.title,
      details.category ?? null,
      details.notes ?? null,
      Date.now(),
      buildId,
      userId,
    );
  if (result.changes !== 1) throw new Error("Build not found");
}

export function deletePlayerBuild(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
): void {
  const result = sqlite
    .prepare("delete from player_builds where id = ? and user_id = ?")
    .run(buildId, userId);
  if (result.changes !== 1) throw new Error("Build not found");
}

export function clonePlayerBuild(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
): string {
  const source = getPlayerBuild(sqlite, userId, buildId);
  if (!source) throw new Error("Build not found");
  return cloneBuildSnapshot(sqlite, userId, source);
}

export function cloneSharedBuild(
  sqlite: Database.Database,
  userId: string,
  shareKey: string,
): string {
  assertUser(sqlite, userId);
  const source = findSharedBuild(sqlite, shareKey);
  if (!source) throw new Error("Shared build not found");
  return cloneBuildSnapshot(sqlite, userId, source);
}

function cloneBuildSnapshot(
  sqlite: Database.Database,
  userId: string,
  source: Pick<
    PlayerBuild,
    "title" | "category" | "notes" | "equipment" | "enhancements"
  >,
): string {
  return sqlite.transaction(() => {
    const cloneId = createPlayerBuild(sqlite, userId, {
      title: cloneTitle(source.title),
      category: source.category,
      notes: source.notes,
    });
    for (const equipment of source.equipment) {
      setBuildEquipment(
        sqlite,
        userId,
        cloneId,
        equipment.slot,
        { kind: equipment.entity.kind, slug: equipment.entity.slug },
        equipment.notes,
      );
      configureBuildEquipment(sqlite, userId, cloneId, equipment.slot, {
        configuration: equipment.configuration,
        rank: equipment.rank,
        formaCount: equipment.formaCount,
        capacityUpgrade: equipment.capacityUpgrade,
      });
      for (const modSlot of equipment.modSlots)
        setBuildModSlot(
          sqlite,
          userId,
          cloneId,
          equipment.slot,
          modSlot.position,
          modSlot.role,
          modSlot.polarity,
        );
      for (const mod of equipment.mods)
        setBuildMod(
          sqlite,
          userId,
          cloneId,
          equipment.slot,
          mod.position,
          { kind: mod.entity.kind, slug: mod.entity.slug },
          mod.rank,
        );
    }
    for (const enhancement of source.enhancements)
      setBuildEnhancement(
        sqlite,
        userId,
        cloneId,
        enhancement.slot,
        { kind: enhancement.entity.kind, slug: enhancement.entity.slug },
        enhancement.rank,
        enhancement.option?.key,
      );
    return cloneId;
  })();
}

export function searchBuildCandidates(
  sqlite: Database.Database,
  slot: BuildSlot | "mod",
  query: string,
  limit = 20,
): BuildCandidate[] {
  if (slot !== "mod" && !(BUILD_SLOTS as readonly string[]).includes(slot))
    throw new Error("Build slot is invalid");
  const { kind, weaponClasses } = equipmentRule(slot);
  const classFilter = weaponClasses.length
    ? `and weapon_class in (${weaponClasses.map(() => "?").join(", ")})`
    : "";
  const normalizedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const candidates = sqlite
    .prepare(
      `
    select kind, slug, name, weapon_class as weaponClass,
      equipment_max_rank as equipmentMaxRank, mod_max_rank as modMaxRank,
      mod_base_drain as modBaseDrain, mod_polarity as modPolarity from entities
    where retired = 0 and kind = ? ${classFilter} and name like ? escape '\\'
    order by case when lower(name) = lower(?) then 0 else 1 end, name collate nocase
    limit ?
  `,
    )
    .all(
      kind,
      ...weaponClasses,
      `%${escapeLike(query.trim())}%`,
      query.trim(),
      normalizedLimit,
    ) as Array<
    Omit<
      BuildCandidate,
      | "weaponClass"
      | "equipmentMaxRank"
      | "modMaxRank"
      | "modBaseDrain"
      | "modPolarity"
    > & {
      weaponClass: WeaponClass | null;
      equipmentMaxRank: number | null;
      modMaxRank: number | null;
      modBaseDrain: number | null;
      modPolarity: ModPolarity | null;
    }
  >;
  return candidates.map(
    ({
      weaponClass,
      equipmentMaxRank,
      modMaxRank,
      modBaseDrain,
      modPolarity,
      ...candidate
    }) => ({
      ...candidate,
      ...(weaponClass ? { weaponClass } : {}),
      ...(equipmentMaxRank !== null ? { equipmentMaxRank } : {}),
      ...(modMaxRank !== null ? { modMaxRank } : {}),
      ...(modBaseDrain !== null ? { modBaseDrain } : {}),
      ...(modPolarity ? { modPolarity } : {}),
    }),
  );
}

export function searchBuildEnhancementCandidates(
  sqlite: Database.Database,
  slot: BuildEnhancementSlot,
  query: string,
  buildId?: string,
  limit = 20,
): BuildCandidate[] {
  const kind = enhancementKind(slot);
  const normalizedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const weaponClass = buildId
    ? equippedWeaponClass(sqlite, buildId, slot)
    : undefined;
  const compatibleArcaneClasses =
    kind === "arcane" ? arcaneClassesForSlot(slot, weaponClass) : [];
  const classFilter =
    kind === "arcane"
      ? `and arcane_class in (${compatibleArcaneClasses.map(() => "?").join(", ")})`
      : "";
  const candidates = sqlite
    .prepare(
      `
    select id, kind, slug, name, arcane_class as arcaneClass from entities
    where retired = 0 and kind = ? ${classFilter} and name like ? escape '\\'
    order by case when lower(name) = lower(?) then 0 else 1 end, name collate nocase
    limit ?
  `,
    )
    .all(
      kind,
      ...compatibleArcaneClasses,
      `%${escapeLike(query.trim())}%`,
      query.trim(),
      normalizedLimit,
    ) as Array<
    BuildCandidate & { id: string; arcaneClass: ArcaneClass | null }
  >;
  return candidates.map(({ id, arcaneClass, ...candidate }) => ({
    ...candidate,
    ...(arcaneClass ? { arcaneClass } : {}),
    ...(kind === "shard"
      ? { enhancementOptions: listEnhancementOptions(sqlite, id) }
      : {}),
  }));
}

export function setBuildEnhancement(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
  slot: BuildEnhancementSlot,
  reference: { kind: string; slug: string },
  rank?: number,
  optionKey?: string,
): void {
  const expectedKind = enhancementKind(slot);
  if (
    rank !== undefined &&
    (!Number.isSafeInteger(rank) || rank < 0 || rank > 100)
  )
    throw new Error("Enhancement rank must be between 0 and 100");
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const entity = findEntity(sqlite, reference);
    if (entity.kind !== expectedKind)
      throw new Error(`${slot} requires a ${expectedKind}, not ${entity.kind}`);
    const weaponClass = equippedWeaponClass(sqlite, buildId, slot);
    if (
      expectedKind === "arcane" &&
      (!entity.arcaneClass ||
        !arcaneClassesForSlot(slot, weaponClass).includes(entity.arcaneClass))
    ) {
      throw new Error(
        `${entity.arcaneClass ?? "Unclassified arcane"} is not compatible with ${slot}`,
      );
    }
    let option: BuildEnhancementOption | undefined;
    if (expectedKind === "shard") {
      if (!optionKey)
        throw new Error("Archon Shards require a sourced effect selection");
      option = listEnhancementOptions(sqlite, entity.id).find(
        ({ key }) => key === optionKey,
      );
      if (!option)
        throw new Error("Archon Shard effect is not active for this shard");
    } else if (optionKey)
      throw new Error("Arcane slots do not accept an Archon Shard effect");
    sqlite
      .prepare(
        `
      insert into build_enhancements (id, build_id, slot, entity_id, rank, option_key, option_label) values (?, ?, ?, ?, ?, ?, ?)
      on conflict(build_id, slot) do update set entity_id = excluded.entity_id, rank = excluded.rank,
        option_key = excluded.option_key, option_label = excluded.option_label
    `,
      )
      .run(
        randomUUID(),
        buildId,
        slot,
        entity.id,
        rank ?? null,
        option?.key ?? null,
        option?.label ?? null,
      );
    touchBuild(sqlite, buildId);
  })();
}

export function removeBuildEnhancement(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
  slot: BuildEnhancementSlot,
): void {
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    enhancementKind(slot);
    const result = sqlite
      .prepare("delete from build_enhancements where build_id = ? and slot = ?")
      .run(buildId, slot);
    if (result.changes !== 1) throw new Error("Build enhancement not found");
    touchBuild(sqlite, buildId);
  })();
}

export function setBuildEquipment(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
  slot: BuildSlot,
  reference: { kind: string; slug: string },
  notes?: string,
): void {
  if (!(BUILD_SLOTS as readonly string[]).includes(slot))
    throw new Error("Build slot is invalid");
  const normalizedNotes = normalizeText(notes, 2_000, "Equipment notes");
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const entity = findEntity(sqlite, reference);
    const { kind: expectedKind, weaponClasses } = equipmentRule(slot);
    if (entity.kind !== expectedKind)
      throw new Error(`${slot} requires a ${expectedKind}, not ${entity.kind}`);
    if (
      weaponClasses.length &&
      (!entity.weaponClass || !weaponClasses.includes(entity.weaponClass))
    )
      throw new Error(
        `${entity.weaponClass ?? "Unclassified weapon"} is not compatible with ${slot}`,
      );
    const arcaneSlot = weaponArcaneSlot(slot);
    if (arcaneSlot) {
      const assignedArcane = sqlite
        .prepare(
          `
        select arcane.arcane_class as arcaneClass
        from build_enhancements enhancement join entities arcane on arcane.id = enhancement.entity_id
        where enhancement.build_id = ? and enhancement.slot = ?
      `,
        )
        .get(buildId, arcaneSlot) as
        { arcaneClass: ArcaneClass | null } | undefined;
      if (
        assignedArcane &&
        (!assignedArcane.arcaneClass ||
          !arcaneClassesForSlot(arcaneSlot, entity.weaponClass).includes(
            assignedArcane.arcaneClass,
          ))
      ) {
        throw new Error(
          `${assignedArcane.arcaneClass ?? "Unclassified arcane"} is not compatible with ${entity.name}`,
        );
      }
    }
    const existing = sqlite
      .prepare(
        "select id, entity_id as entityId from build_equipment where build_id = ? and slot = ?",
      )
      .get(buildId, slot) as { id: string; entityId: string } | undefined;
    if (existing) {
      if (existing.entityId !== entity.id) {
        sqlite
          .prepare("delete from build_mods where equipment_id = ?")
          .run(existing.id);
        sqlite
          .prepare("delete from build_mod_slots where equipment_id = ?")
          .run(existing.id);
        sqlite
          .prepare(
            "update build_equipment set entity_id = ?, notes = ?, configuration = null, rank = null, forma_count = 0, capacity_upgrade = 0 where id = ?",
          )
          .run(entity.id, normalizedNotes ?? null, existing.id);
      } else {
        sqlite
          .prepare("update build_equipment set notes = ? where id = ?")
          .run(normalizedNotes ?? null, existing.id);
      }
    } else {
      sqlite
        .prepare(
          "insert into build_equipment (id, build_id, slot, entity_id, notes) values (?, ?, ?, ?, ?)",
        )
        .run(randomUUID(), buildId, slot, entity.id, normalizedNotes ?? null);
    }
    touchBuild(sqlite, buildId);
  })();
}

export function removeBuildEquipment(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
  slot: BuildSlot,
): void {
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const result = sqlite
      .prepare("delete from build_equipment where build_id = ? and slot = ?")
      .run(buildId, slot);
    if (result.changes !== 1) throw new Error("Build equipment not found");
    touchBuild(sqlite, buildId);
  })();
}

export function configureBuildEquipment(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
  slot: BuildSlot,
  input: {
    configuration?: string;
    rank?: number;
    formaCount: number;
    capacityUpgrade: boolean;
  },
): void {
  if (!(BUILD_SLOTS as readonly string[]).includes(slot))
    throw new Error("Build slot is invalid");
  const configuration = normalizeText(
    input.configuration,
    120,
    "Configuration",
  );
  if (
    input.rank !== undefined &&
    (!Number.isSafeInteger(input.rank) || input.rank < 0 || input.rank > 40)
  )
    throw new Error("Equipment rank must be between 0 and 40");
  if (
    !Number.isSafeInteger(input.formaCount) ||
    input.formaCount < 0 ||
    input.formaCount > 100
  )
    throw new Error("Forma count must be between 0 and 100");
  if (typeof input.capacityUpgrade !== "boolean")
    throw new Error("Capacity upgrade must be boolean");
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const equipment = sqlite
      .prepare(
        `select equipment.id, entity.name, entity.equipment_max_rank as maxRank
         from build_equipment equipment join entities entity on entity.id = equipment.entity_id
         where equipment.build_id = ? and equipment.slot = ?`,
      )
      .get(buildId, slot) as
      { id: string; name: string; maxRank: number | null } | undefined;
    if (!equipment) throw new Error("Build equipment not found");
    if (
      input.rank !== undefined &&
      equipment.maxRank !== null &&
      input.rank > equipment.maxRank
    )
      throw new Error(
        `${equipment.name} rank must not exceed ${equipment.maxRank}`,
      );
    const result = sqlite
      .prepare(
        "update build_equipment set configuration = ?, rank = ?, forma_count = ?, capacity_upgrade = ? where id = ?",
      )
      .run(
        configuration ?? null,
        input.rank ?? null,
        input.formaCount,
        input.capacityUpgrade ? 1 : 0,
        equipment.id,
      );
    if (result.changes !== 1) throw new Error("Build equipment not found");
    touchBuild(sqlite, buildId);
  })();
}

export function setBuildModSlot(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
  slot: BuildSlot,
  position: number,
  role: BuildModSlotRole,
  polarity?: ModPolarity,
): void {
  if (!Number.isSafeInteger(position) || position < 0 || position > 19)
    throw new Error("Mod slot position must be between 0 and 19");
  if (!(BUILD_MOD_SLOT_ROLES as readonly string[]).includes(role))
    throw new Error("Mod slot role is invalid");
  if (
    polarity !== undefined &&
    !(BUILD_MOD_SLOT_POLARITIES as readonly string[]).includes(polarity)
  )
    throw new Error("Mod slot polarity is invalid");
  if (role === "aura" && slot !== "warframe")
    throw new Error("Aura slots are only valid on Warframes");
  if (role === "stance" && slot !== "melee")
    throw new Error("Stance slots are only valid on melee weapons");
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const equipment = sqlite
      .prepare("select id from build_equipment where build_id = ? and slot = ?")
      .get(buildId, slot) as { id: string } | undefined;
    if (!equipment)
      throw new Error("Add equipment before configuring mod slots");
    if (role !== "normal") {
      const duplicate = sqlite
        .prepare(
          "select position from build_mod_slots where equipment_id = ? and role = ? and position <> ?",
        )
        .get(equipment.id, role, position) as { position: number } | undefined;
      if (duplicate)
        throw new Error(`Equipment already has a configured ${role} slot`);
    }
    sqlite
      .prepare(
        `insert into build_mod_slots (equipment_id, position, role, polarity) values (?, ?, ?, ?)
         on conflict(equipment_id, position) do update set role = excluded.role, polarity = excluded.polarity`,
      )
      .run(equipment.id, position, role, polarity ?? null);
    touchBuild(sqlite, buildId);
  })();
}

export function removeBuildModSlot(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
  slot: BuildSlot,
  position: number,
): void {
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const result = sqlite
      .prepare(
        "delete from build_mod_slots where equipment_id in (select id from build_equipment where build_id = ? and slot = ?) and position = ?",
      )
      .run(buildId, slot, position);
    if (result.changes !== 1) throw new Error("Configured mod slot not found");
    touchBuild(sqlite, buildId);
  })();
}

export function setBuildMod(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
  slot: BuildSlot,
  position: number,
  reference: { kind: string; slug: string },
  rank?: number,
): void {
  if (!Number.isSafeInteger(position) || position < 0 || position > 19)
    throw new Error("Mod position must be between 0 and 19");
  if (
    rank !== undefined &&
    (!Number.isSafeInteger(rank) || rank < 0 || rank > 100)
  )
    throw new Error("Mod rank must be between 0 and 100");
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const equipment = sqlite
      .prepare("select id from build_equipment where build_id = ? and slot = ?")
      .get(buildId, slot) as { id: string } | undefined;
    if (!equipment) throw new Error("Add equipment before assigning its mods");
    const mod = findEntity(sqlite, reference);
    if (mod.kind !== "mod")
      throw new Error(`Mod slot requires a mod, not ${mod.kind}`);
    if (rank !== undefined && mod.modMaxRank !== null && rank > mod.modMaxRank)
      throw new Error(`${mod.name} rank must not exceed ${mod.modMaxRank}`);
    sqlite
      .prepare(
        `
      insert into build_mods (id, equipment_id, position, entity_id, rank) values (?, ?, ?, ?, ?)
      on conflict(equipment_id, position) do update set entity_id = excluded.entity_id, rank = excluded.rank
    `,
      )
      .run(randomUUID(), equipment.id, position, mod.id, rank ?? null);
    touchBuild(sqlite, buildId);
  })();
}

export function removeBuildMod(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
  slot: BuildSlot,
  position: number,
): void {
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const result = sqlite
      .prepare(
        "delete from build_mods where equipment_id in (select id from build_equipment where build_id = ? and slot = ?) and position = ?",
      )
      .run(buildId, slot, position);
    if (result.changes !== 1) throw new Error("Build mod not found");
    touchBuild(sqlite, buildId);
  })();
}

export function createBuildShare(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
): string {
  const build = getPlayerBuild(sqlite, userId, buildId);
  if (!build) throw new Error("Build not found");
  const shareKey = randomBytes(18).toString("base64url");
  const sharedAt = Date.now();
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...snapshot
  } = build;
  sqlite
    .prepare(
      "insert into build_share_snapshots (id, share_key, source_build_id, revision, title, snapshot_json, created_at) values (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      randomUUID(),
      shareKey,
      buildId,
      build.revision,
      build.title,
      JSON.stringify({ ...snapshot, shareKey, sharedAt }),
      sharedAt,
    );
  return shareKey;
}

export function findSharedBuild(
  sqlite: Database.Database,
  shareKey: string,
): SharedBuildSnapshot | undefined {
  const row = sqlite
    .prepare(
      "select snapshot_json as snapshotJson from build_share_snapshots where share_key = ?",
    )
    .get(shareKey) as { snapshotJson: string } | undefined;
  if (!row) return undefined;
  return JSON.parse(row.snapshotJson) as SharedBuildSnapshot;
}

export function listBuildShares(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
): BuildShareSummary[] {
  assertBuildOwner(sqlite, userId, buildId);
  return sqlite
    .prepare(
      "select share_key as shareKey, revision, created_at as createdAt from build_share_snapshots where source_build_id = ? order by created_at desc",
    )
    .all(buildId) as BuildShareSummary[];
}

export function revokeBuildShare(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
  shareKey: string,
): void {
  assertBuildOwner(sqlite, userId, buildId);
  const result = sqlite
    .prepare(
      "delete from build_share_snapshots where source_build_id = ? and share_key = ?",
    )
    .run(buildId, shareKey);
  if (result.changes !== 1) throw new Error("Build share not found");
}

export function addBuildAcquisitionGoals(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
): number {
  assertBuildOwner(sqlite, userId, buildId);
  const requirements = sqlite
    .prepare(
      `
    select entity_id as entityId, count(*) as quantity from (
      select entity_id from build_equipment where build_id = ?
      union all
      select mod.entity_id from build_mods mod join build_equipment equipment on equipment.id = mod.equipment_id where equipment.build_id = ?
      union all
      select entity_id from build_enhancements where build_id = ?
    ) group by entity_id
  `,
    )
    .all(buildId, buildId, buildId) as Array<{
    entityId: string;
    quantity: number;
  }>;
  const inventory = sqlite.prepare(
    "select coalesce(owned_count, 0) + coalesce(built_count, 0) as available from player_inventory where user_id = ? and entity_id = ?",
  );
  const existingGoal = sqlite.prepare(
    "select target_quantity as targetQuantity from player_goals where user_id = ? and entity_id = ?",
  );
  const writeGoal = sqlite.prepare(`
    insert into player_goals (user_id, entity_id, target_quantity, created_at, updated_at)
    values (?, ?, ?, ?, ?)
    on conflict(user_id, entity_id) do update set target_quantity = excluded.target_quantity, updated_at = excluded.updated_at
  `);
  return sqlite.transaction(() => {
    let changed = 0;
    for (const requirement of requirements) {
      const available =
        (
          inventory.get(userId, requirement.entityId) as
            { available: number } | undefined
        )?.available ?? 0;
      if (available >= requirement.quantity) continue;
      const currentTarget =
        (
          existingGoal.get(userId, requirement.entityId) as
            { targetQuantity: number } | undefined
        )?.targetQuantity ?? 0;
      const target = Math.max(currentTarget, requirement.quantity);
      if (target === currentTarget) continue;
      const now = Date.now();
      writeGoal.run(userId, requirement.entityId, target, now, now);
      changed += 1;
    }
    return changed;
  })();
}

function hydrateBuild(
  sqlite: Database.Database,
  build: {
    id: string;
    title: string;
    category: string | null;
    notes: string | null;
    revision: number;
    createdAt: number;
    updatedAt: number;
  },
  playerMasteryRank: number | undefined,
): PlayerBuild {
  const equipmentRows = sqlite
    .prepare(
      `
    select equipment.id, equipment.slot, equipment.notes, equipment.configuration,
      equipment.rank, entity.equipment_max_rank as equipmentMaxRank,
      equipment.forma_count as formaCount,
      equipment.capacity_upgrade as capacityUpgrade,
      entity.id as entityId, entity.kind, entity.slug, entity.name
    from build_equipment equipment join entities entity on entity.id = equipment.entity_id
    where equipment.build_id = ? order by equipment.slot
  `,
    )
    .all(build.id) as Array<{
    id: string;
    slot: BuildSlot;
    notes: string | null;
    configuration: string | null;
    rank: number | null;
    equipmentMaxRank: number | null;
    formaCount: number;
    capacityUpgrade: number;
    entityId: string;
    kind: string;
    slug: string;
    name: string;
  }>;
  const modsQuery = sqlite.prepare(`
    select mod.position, mod.rank, entity.kind, entity.slug, entity.name,
      entity.mod_max_rank as modMaxRank, entity.mod_base_drain as modBaseDrain,
      entity.mod_polarity as modPolarity, slot.role as slotRole,
      slot.polarity as slotPolarity
    from build_mods mod join entities entity on entity.id = mod.entity_id
    left join build_mod_slots slot on slot.equipment_id = mod.equipment_id
      and slot.position = mod.position
    where mod.equipment_id = ? order by mod.position
  `);
  const modSlotsQuery = sqlite.prepare(`
    select position, role, polarity from build_mod_slots
    where equipment_id = ? order by position
  `);
  const enhancements = sqlite
    .prepare(
      `
    select enhancement.slot, enhancement.rank, enhancement.option_key as optionKey,
      enhancement.option_label as optionLabel, entity.id as entityId, entity.kind, entity.slug, entity.name
    from build_enhancements enhancement join entities entity on entity.id = enhancement.entity_id
    where enhancement.build_id = ? order by enhancement.slot
  `,
    )
    .all(build.id) as Array<{
    slot: BuildEnhancementSlot;
    rank: number | null;
    optionKey: string | null;
    optionLabel: string | null;
    entityId: string;
    kind: string;
    slug: string;
    name: string;
  }>;
  return {
    id: build.id,
    title: build.title,
    category: build.category ?? undefined,
    notes: build.notes ?? undefined,
    revision: build.revision,
    createdAt: build.createdAt,
    updatedAt: build.updatedAt,
    equipment: equipmentRows.map((entry) => {
      const modSlots = (
        modSlotsQuery.all(entry.id) as Array<{
          position: number;
          role: BuildModSlotRole;
          polarity: ModPolarity | null;
        }>
      ).map(({ position, role, polarity }) => ({
        position,
        role,
        ...(polarity ? { polarity } : {}),
      }));
      const mods = (
        modsQuery.all(entry.id) as Array<{
          position: number;
          rank: number | null;
          kind: string;
          slug: string;
          name: string;
          modMaxRank: number | null;
          modBaseDrain: number | null;
          modPolarity: ModPolarity | null;
          slotRole: BuildModSlotRole | null;
          slotPolarity: ModPolarity | null;
        }>
      ).map(
        ({
          position,
          rank,
          kind,
          slug,
          name,
          modMaxRank,
          modBaseDrain,
          modPolarity,
          slotRole,
          slotPolarity,
        }) => {
          const drain = calculateRankedModDrain(
            modBaseDrain ?? undefined,
            rank ?? undefined,
          );
          const adjustedDrain = calculatePolarityAdjustedDrain(
            drain,
            modPolarity ?? undefined,
            slotRole
              ? {
                  position,
                  role: slotRole,
                  polarity: slotPolarity ?? undefined,
                }
              : undefined,
          );
          return {
            position,
            rank: rank ?? undefined,
            ...(modMaxRank !== null ? { maxRank: modMaxRank } : {}),
            ...(modBaseDrain !== null ? { baseDrain: modBaseDrain } : {}),
            ...(modPolarity !== null ? { polarity: modPolarity } : {}),
            ...(drain === undefined ? {} : { drain }),
            ...(adjustedDrain === undefined ? {} : { adjustedDrain }),
            entity: { kind, slug, name },
          };
        },
      );
      const factoryPolaritySets = listEquipmentPolaritySetsByEntityId(
        sqlite,
        entry.entityId,
      );
      return {
        id: entry.id,
        slot: entry.slot,
        entity: { kind: entry.kind, slug: entry.slug, name: entry.name },
        notes: entry.notes ?? undefined,
        configuration: entry.configuration ?? undefined,
        rank: entry.rank ?? undefined,
        ...(entry.equipmentMaxRank !== null
          ? { maxRank: entry.equipmentMaxRank }
          : {}),
        formaCount: entry.formaCount,
        capacityUpgrade: Boolean(entry.capacityUpgrade),
        ...(factoryPolaritySets.length ? { factoryPolaritySets } : {}),
        ...(entry.slot === "operator-amp"
          ? {}
          : {
              capacity: calculateBuildCapacity(
                entry.rank ?? undefined,
                entry.equipmentMaxRank ?? undefined,
                playerMasteryRank,
                Boolean(entry.capacityUpgrade),
                mods,
              ),
            }),
        modSlots,
        mods,
      };
    }),
    enhancements: enhancements.map(
      ({ slot, rank, optionKey, optionLabel, entityId, kind, slug, name }) => ({
        slot,
        rank: rank ?? undefined,
        entity: { kind, slug, name },
        ...(optionKey && optionLabel
          ? {
              option: {
                key: optionKey,
                label: optionLabel,
                available: listEnhancementOptions(sqlite, entityId).some(
                  ({ key }) => key === optionKey,
                ),
              },
            }
          : {}),
      }),
    ),
  };
}

function validateDetails(input: {
  title: string;
  category?: string;
  notes?: string;
}) {
  const title = input.title.trim();
  if (!title || title.length > 160)
    throw new Error("Build title must contain between 1 and 160 characters");
  return {
    title,
    category: normalizeText(input.category, 80, "Build category"),
    notes: normalizeText(input.notes, 10_000, "Build notes"),
  };
}
function cloneTitle(title: string): string {
  const suffix = " (copy)";
  return `${title.slice(0, 160 - suffix.length).trimEnd()}${suffix}`;
}
function normalizeText(
  value: string | undefined,
  maximum: number,
  label: string,
): string | undefined {
  const text = value?.trim() || undefined;
  if (text && text.length > maximum)
    throw new Error(`${label} cannot exceed ${maximum} characters`);
  return text;
}
function assertUser(sqlite: Database.Database, userId: string): void {
  if (!sqlite.prepare("select 1 from users where id = ?").get(userId))
    throw new Error("Unknown user");
}
function assertBuildOwner(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
): void {
  if (
    !sqlite
      .prepare("select 1 from player_builds where id = ? and user_id = ?")
      .get(buildId, userId)
  )
    throw new Error("Build not found");
}
function findEntity(
  sqlite: Database.Database,
  reference: { kind: string; slug: string },
): {
  id: string;
  kind: string;
  name: string;
  arcaneClass?: ArcaneClass;
  weaponClass?: WeaponClass;
  modMaxRank: number | null;
} {
  const entity = sqlite
    .prepare(
      "select id, kind, name, arcane_class as arcaneClass, weapon_class as weaponClass, mod_max_rank as modMaxRank from entities where kind = ? and slug = ? and retired = 0",
    )
    .get(reference.kind, reference.slug) as
    | {
        id: string;
        kind: string;
        name: string;
        arcaneClass?: ArcaneClass;
        weaponClass?: WeaponClass;
        modMaxRank: number | null;
      }
    | undefined;
  if (!entity)
    throw new Error(
      `Unknown active entity ${reference.kind}:${reference.slug}`,
    );
  return entity;
}
export function calculateRankedModDrain(
  baseDrain: number | undefined,
  rank: number | undefined,
): number | undefined {
  if (baseDrain === undefined || rank === undefined) return undefined;
  return baseDrain < 0 ? baseDrain - rank : baseDrain + rank;
}
export function calculatePolarityAdjustedDrain(
  drain: number | undefined,
  modPolarity: ModPolarity | undefined,
  slot: BuildModSlot | undefined,
): number | undefined {
  if (drain === undefined || !slot) return undefined;
  const special = slot.role === "aura" || slot.role === "stance";
  if ((special && drain > 0) || (!special && drain < 0)) return undefined;
  if (slot.polarity === undefined) return drain;
  if (modPolarity === undefined) return undefined;
  const matches =
    modPolarity === slot.polarity ||
    (modPolarity === "aura" && slot.polarity !== "umbra") ||
    (slot.polarity === "aura" && modPolarity !== "umbra");
  if (special) {
    const bonus = Math.abs(drain);
    return -(matches ? bonus * 2 : Math.floor(bonus * 0.8));
  }
  return matches ? Math.ceil(drain / 2) : Math.ceil(drain * 1.25);
}
export function calculateEquipmentBaseCapacity(
  rank: number | undefined,
  maxRank: number | undefined,
  playerMasteryRank: number | undefined,
  capacityUpgrade: boolean,
): number | undefined {
  let effectiveRank: number;
  if (rank !== undefined && playerMasteryRank !== undefined) {
    effectiveRank = Math.max(rank, playerMasteryRank);
    if (effectiveRank > 30 && maxRank === undefined) return undefined;
  } else {
    const knownRank = rank ?? playerMasteryRank;
    if (knownRank === undefined || maxRank === undefined || knownRank < maxRank)
      return undefined;
    effectiveRank = knownRank;
  }
  if (maxRank !== undefined) effectiveRank = Math.min(effectiveRank, maxRank);
  const capacity =
    effectiveRank <= 30 ? 15 + Math.floor(effectiveRank / 2) : effectiveRank;
  return capacityUpgrade ? capacity * 2 : capacity;
}
export function calculateBuildCapacity(
  rank: number | undefined,
  maxRank: number | undefined,
  playerMasteryRank: number | undefined,
  capacityUpgrade: boolean,
  mods: ReadonlyArray<Pick<BuildMod, "adjustedDrain">>,
): BuildCapacity {
  const base = calculateEquipmentBaseCapacity(
    rank,
    maxRank,
    playerMasteryRank,
    capacityUpgrade,
  );
  if (base === undefined) return {};
  if (mods.some(({ adjustedDrain }) => adjustedDrain === undefined))
    return { base };
  const bonus = mods.reduce(
    (sum, { adjustedDrain = 0 }) =>
      sum + (adjustedDrain < 0 ? Math.abs(adjustedDrain) : 0),
    0,
  );
  const drain = mods.reduce(
    (sum, { adjustedDrain = 0 }) =>
      sum + (adjustedDrain > 0 ? adjustedDrain : 0),
    0,
  );
  const total = base + bonus;
  return { base, bonus, total, drain, remaining: total - drain };
}
function enhancementKind(slot: BuildEnhancementSlot): "arcane" | "shard" {
  if (!(BUILD_ENHANCEMENT_SLOTS as readonly string[]).includes(slot))
    throw new Error("Build enhancement slot is invalid");
  return slot.startsWith("archon-shard-") ? "shard" : "arcane";
}
function arcaneClassesForSlot(
  slot: BuildEnhancementSlot,
  weaponClass?: WeaponClass,
): ArcaneClass[] {
  if (slot.startsWith("warframe-arcane-")) return ["warframe"];
  if (slot.startsWith("operator-arcane-")) return ["operator"];
  if (slot.startsWith("amp-arcane-")) return ["amp"];
  if (slot === "primary-arcane")
    return weaponClass === undefined
      ? ["primary", "kitgun", "bow", "shotgun"]
      : [
          "primary",
          ...(weaponClass === "kitgun" ||
          weaponClass === "bow" ||
          weaponClass === "shotgun"
            ? [weaponClass]
            : []),
        ];
  if (slot === "secondary-arcane")
    return weaponClass === undefined
      ? ["secondary", "kitgun"]
      : ["secondary", ...(weaponClass === "kitgun" ? ["kitgun" as const] : [])];
  if (slot === "melee-arcane")
    return weaponClass === undefined
      ? ["melee", "zaw"]
      : ["melee", ...(weaponClass === "zaw" ? ["zaw" as const] : [])];
  throw new Error("Build enhancement slot is invalid");
}
function equipmentRule(slot: BuildSlot | "mod"): {
  kind: string;
  weaponClasses: WeaponClass[];
} {
  if (slot === "mod") return { kind: "mod", weaponClasses: [] };
  if (slot === "warframe") return { kind: "warframe", weaponClasses: [] };
  if (slot === "companion") return { kind: "companion", weaponClasses: [] };
  if (slot === "archwing") return { kind: "archwing", weaponClasses: [] };
  return { kind: "weapon", weaponClasses: weaponClassesForSlot(slot) };
}
function weaponClassesForSlot(slot: BuildSlot): WeaponClass[] {
  if (slot === "primary") return ["primary", "bow", "shotgun", "kitgun"];
  if (slot === "secondary") return ["secondary", "kitgun"];
  if (slot === "melee") return ["melee", "zaw"];
  if (slot === "companion-weapon") return ["companion"];
  if (slot === "archgun") return ["archgun"];
  if (slot === "archmelee") return ["archmelee"];
  if (slot === "operator-amp") return ["amp"];
  return [];
}
function weaponArcaneSlot(slot: BuildSlot): BuildEnhancementSlot | undefined {
  if (slot === "primary" || slot === "secondary" || slot === "melee")
    return `${slot}-arcane`;
  return undefined;
}
function equippedWeaponClass(
  sqlite: Database.Database,
  buildId: string,
  slot: BuildEnhancementSlot,
): WeaponClass | undefined {
  const equipmentSlot =
    slot === "primary-arcane"
      ? "primary"
      : slot === "secondary-arcane"
        ? "secondary"
        : slot === "melee-arcane"
          ? "melee"
          : undefined;
  if (!equipmentSlot) return undefined;
  const row = sqlite
    .prepare(
      `
    select entity.weapon_class as weaponClass
    from build_equipment equipment join entities entity on entity.id = equipment.entity_id
    where equipment.build_id = ? and equipment.slot = ?
  `,
    )
    .get(buildId, equipmentSlot) as
    { weaponClass: WeaponClass | null } | undefined;
  return row?.weaponClass ?? undefined;
}
function listEnhancementOptions(
  sqlite: Database.Database,
  entityId: string,
): BuildEnhancementOption[] {
  return sqlite
    .prepare(
      `
    with ranked as (
      select option.key, option.label, source.name as sourceName, option.citation_url as citationUrl,
        row_number() over (
          partition by option.key
          order by source.priority desc, run.retrieved_at desc, source.id, option.source_record_key, option.id
        ) as preference
      from entity_enhancement_options option
      join source_runs run on run.id = option.source_run_id and run.status = 'active'
      join sources source on source.id = run.source_id
      where option.entity_id = ?
    )
    select key, label, sourceName, citationUrl from ranked where preference = 1 order by label collate nocase, key
  `,
    )
    .all(entityId)
    .map((row) => {
      const option = row as {
        key: string;
        label: string;
        sourceName: string;
        citationUrl: string | null;
      };
      return { ...option, citationUrl: option.citationUrl ?? undefined };
    });
}
function touchBuild(sqlite: Database.Database, buildId: string): void {
  sqlite
    .prepare(
      "update player_builds set revision = revision + 1, updated_at = ? where id = ?",
    )
    .run(Date.now(), buildId);
}
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
