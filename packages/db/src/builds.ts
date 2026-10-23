import { randomBytes, randomUUID } from "node:crypto";
import {
  MOD_POLARITIES,
  type ArcaneClass,
  type ModularPartRole,
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
export const BUILD_PANEL_KEYS = [
  "warframe",
  "primary",
  "secondary",
  "melee",
  "companion",
  "companion-weapon",
  "archwing",
  "archgun",
  "archmelee",
  "operator",
] as const;
export type BuildPanelKey = (typeof BUILD_PANEL_KEYS)[number];
export interface BuildSlotProfile {
  normalSlots: number;
  auraSlots: number;
  stanceSlots: number;
  exilusSlots: number;
  capacityUpgrade: "reactor" | "catalyst" | undefined;
}
export function buildSlotProfile(slot: BuildSlot): BuildSlotProfile {
  if (slot === "operator-amp")
    return {
      normalSlots: 0,
      auraSlots: 0,
      stanceSlots: 0,
      exilusSlots: 0,
      capacityUpgrade: undefined,
    };
  return {
    normalSlots: slot === "companion" ? 10 : 8,
    auraSlots: slot === "warframe" ? 1 : 0,
    stanceSlots: slot === "melee" ? 1 : 0,
    exilusSlots: ["warframe", "primary", "secondary", "melee"].includes(slot)
      ? 1
      : 0,
    capacityUpgrade: ["warframe", "companion", "archwing"].includes(slot)
      ? "reactor"
      : "catalyst",
  };
}

export function buildModSlotRoleAt(
  slot: BuildSlot,
  position: number,
): BuildModSlotRole | undefined {
  const profile = buildSlotProfile(slot);
  if (position >= 0 && position < profile.normalSlots) return "normal";
  if (slot === "warframe" && (position === 10 || position === 11))
    return "aura";
  if (slot === "melee" && position === 10) return "stance";
  if (profile.exilusSlots && position === 12) return "exilus";
  return undefined;
}
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
export interface BuildStat {
  key: string;
  label: string;
  baseValue: string;
  sourceName: string;
  citationUrl?: string;
}
export interface BuildAbility extends BuildEntityReference {
  description?: string;
  slot: number;
  helminthEligible: boolean;
  sourceName?: string;
  citationUrl?: string;
}
export interface BuildAbilityReplacement {
  original: BuildAbility;
  replacement: BuildAbility;
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
  stats?: BuildStat[];
  passive?: BuildStat;
  abilities?: BuildAbility[];
  capacity?: BuildCapacity;
  factoryPolaritySets?: CatalogEquipmentPolaritySet[];
  modularPartRoles: ModularPartRole[];
  modularParts: BuildModularPart[];
  modSlots: BuildModSlot[];
  mods: BuildMod[];
}
export interface BuildModularPart {
  role: ModularPartRole;
  entity: BuildEntityReference;
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
  focusSchool?: BuildEntityReference & { description?: string };
  abilityReplacement?: BuildAbilityReplacement;
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

export function modularPartRolesForWeaponClass(
  weaponClass: WeaponClass | undefined,
): ModularPartRole[] {
  if (weaponClass === "kitgun") return ["kitgun-grip", "kitgun-loader"];
  if (weaponClass === "zaw") return ["zaw-grip", "zaw-link"];
  return [];
}

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
    | "title"
    | "category"
    | "notes"
    | "equipment"
    | "enhancements"
    | "focusSchool"
    | "abilityReplacement"
  >,
): string {
  return sqlite.transaction(() => {
    const cloneId = createPlayerBuild(sqlite, userId, {
      title: cloneTitle(source.title),
      category: source.category,
      notes: source.notes,
    });
    if (source.focusSchool)
      setBuildFocusSchool(sqlite, userId, cloneId, source.focusSchool);
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
      for (const part of equipment.modularParts)
        setBuildModularPart(
          sqlite,
          userId,
          cloneId,
          equipment.slot,
          part.role,
          { kind: part.entity.kind, slug: part.entity.slug },
        );
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
    if (source.abilityReplacement)
      setBuildAbilityReplacement(
        sqlite,
        userId,
        cloneId,
        source.abilityReplacement.original,
        source.abilityReplacement.replacement,
      );
    return cloneId;
  })();
}

export function searchBuildFocusSchools(
  sqlite: Database.Database,
  query: string,
  limit = 20,
): BuildCandidate[] {
  return sqlite
    .prepare(
      `select kind, slug, name from entities
       where retired = 0 and kind = 'focus-school' and name like ? escape '\\'
       order by name collate nocase limit ?`,
    )
    .all(
      `%${escapeLike(query.trim())}%`,
      Math.max(1, Math.min(20, limit)),
    ) as BuildCandidate[];
}

export function setBuildFocusSchool(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
  reference: { kind: string; slug: string },
): void {
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const entity = findEntity(sqlite, reference);
    if (entity.kind !== "focus-school")
      throw new Error("Operator Focus requires a focus school");
    sqlite
      .prepare(
        "update player_builds set focus_school_entity_id = ? where id = ?",
      )
      .run(entity.id, buildId);
    touchBuild(sqlite, buildId);
  })();
}

export function removeBuildFocusSchool(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
): void {
  assertBuildOwner(sqlite, userId, buildId);
  sqlite
    .prepare(
      "update player_builds set focus_school_entity_id = null where id = ?",
    )
    .run(buildId);
  touchBuild(sqlite, buildId);
}

export function searchHelminthAbilities(
  sqlite: Database.Database,
  query: string,
  limit = 30,
): BuildAbility[] {
  const rows = sqlite
    .prepare(
      `select distinct entity.id
       from entities entity
       join entity_attributes attribute on attribute.entity_id = entity.id
       join source_runs run on run.id = attribute.source_run_id and run.status = 'active'
       where entity.retired = 0 and entity.kind = 'ability'
         and attribute.key = 'helminth-eligible' and attribute.value = 'true'
         and entity.name like ? escape '\\'
       order by entity.name collate nocase limit ?`,
    )
    .all(
      `%${escapeLike(query.trim())}%`,
      Math.max(1, Math.min(100, Math.trunc(limit))),
    ) as Array<{ id: string }>;
  return rows.map(({ id }) => hydrateAbility(sqlite, id));
}

export function setBuildAbilityReplacement(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
  originalReference: { kind: string; slug: string },
  replacementReference: { kind: string; slug: string },
): void {
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const original = findEntity(sqlite, originalReference);
    const replacement = findEntity(sqlite, replacementReference);
    if (original.kind !== "ability" || replacement.kind !== "ability")
      throw new Error("Helminth replacement requires two abilities");
    const warframe = sqlite
      .prepare(
        "select entity_id as entityId from build_equipment where build_id = ? and slot = 'warframe'",
      )
      .get(buildId) as { entityId: string } | undefined;
    if (!warframe)
      throw new Error("Equip a Warframe before replacing an ability");
    if (!abilityBelongsTo(sqlite, warframe.entityId, original.id))
      throw new Error(
        "Original ability does not belong to the equipped Warframe",
      );
    if (!hydrateAbility(sqlite, replacement.id).helminthEligible)
      throw new Error(
        "Replacement ability is not sourced as Helminth eligible",
      );
    if (original.id === replacement.id)
      throw new Error("Replacement ability must differ from the original");
    sqlite
      .prepare(
        `insert into build_ability_replacements (build_id, original_ability_id, replacement_ability_id)
         values (?, ?, ?)
         on conflict(build_id) do update set original_ability_id = excluded.original_ability_id,
           replacement_ability_id = excluded.replacement_ability_id`,
      )
      .run(buildId, original.id, replacement.id);
    touchBuild(sqlite, buildId);
  })();
}

export function removeBuildAbilityReplacement(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
): void {
  assertBuildOwner(sqlite, userId, buildId);
  const result = sqlite
    .prepare("delete from build_ability_replacements where build_id = ?")
    .run(buildId);
  if (result.changes !== 1) throw new Error("Helminth replacement not found");
  touchBuild(sqlite, buildId);
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

export function searchBuildModularPartCandidates(
  sqlite: Database.Database,
  buildId: string,
  slot: BuildSlot,
  role: ModularPartRole,
  query: string,
  limit = 20,
): BuildCandidate[] {
  const allowed = modularRolesForEquippedSlot(sqlite, buildId, slot);
  if (!allowed.includes(role))
    throw new Error(`${role} is not compatible with ${slot}`);
  const normalizedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return sqlite
    .prepare(
      `select kind, slug, name from entities
       where retired = 0 and modular_part_role = ? and name like ? escape '\\'
       order by case when lower(name) = lower(?) then 0 else 1 end, name collate nocase
       limit ?`,
    )
    .all(
      role,
      `%${escapeLike(query.trim())}%`,
      query.trim(),
      normalizedLimit,
    ) as BuildCandidate[];
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
          .prepare("delete from build_modular_parts where equipment_id = ?")
          .run(existing.id);
        sqlite
          .prepare(
            "update build_equipment set entity_id = ?, notes = ?, configuration = null, rank = null, forma_count = 0, capacity_upgrade = 0 where id = ?",
          )
          .run(entity.id, normalizedNotes ?? null, existing.id);
        if (slot === "warframe")
          sqlite
            .prepare(
              "delete from build_ability_replacements where build_id = ?",
            )
            .run(buildId);
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
    if (slot === "warframe")
      sqlite
        .prepare("delete from build_ability_replacements where build_id = ?")
        .run(buildId);
    touchBuild(sqlite, buildId);
  })();
}

export function setBuildModularPart(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
  slot: BuildSlot,
  role: ModularPartRole,
  reference: { kind: string; slug: string },
): void {
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const allowed = modularRolesForEquippedSlot(sqlite, buildId, slot);
    if (!allowed.includes(role))
      throw new Error(`${role} is not compatible with ${slot}`);
    const entity = findEntity(sqlite, reference);
    if (entity.modularPartRole !== role)
      throw new Error(`${entity.name} is not a ${role}`);
    const equipment = sqlite
      .prepare("select id from build_equipment where build_id = ? and slot = ?")
      .get(buildId, slot) as { id: string };
    sqlite
      .prepare(
        `insert into build_modular_parts (equipment_id, role, entity_id) values (?, ?, ?)
         on conflict(equipment_id, role) do update set entity_id = excluded.entity_id`,
      )
      .run(equipment.id, role, entity.id);
    touchBuild(sqlite, buildId);
  })();
}

export function removeBuildModularPart(
  sqlite: Database.Database,
  userId: string,
  buildId: string,
  slot: BuildSlot,
  role: ModularPartRole,
): void {
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const equipment = sqlite
      .prepare("select id from build_equipment where build_id = ? and slot = ?")
      .get(buildId, slot) as { id: string } | undefined;
    if (!equipment) throw new Error("Build equipment not found");
    const result = sqlite
      .prepare(
        "delete from build_modular_parts where equipment_id = ? and role = ?",
      )
      .run(equipment.id, role);
    if (result.changes !== 1) throw new Error("Build modular part not found");
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
  if (!Number.isSafeInteger(position)) throw new Error("Mod slot is invalid");
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
  if (buildModSlotRoleAt(slot, position) !== role)
    throw new Error("Mod slot role does not match the equipment slot profile");
  sqlite.transaction(() => {
    assertBuildOwner(sqlite, userId, buildId);
    const equipment = sqlite
      .prepare("select id from build_equipment where build_id = ? and slot = ?")
      .get(buildId, slot) as { id: string } | undefined;
    if (!equipment)
      throw new Error("Add equipment before configuring mod slots");
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
  if (!Number.isSafeInteger(position) || !buildModSlotRoleAt(slot, position))
    throw new Error("Mod position is not valid for this equipment slot");
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
        `insert into build_mod_slots (equipment_id, position, role, polarity)
         values (?, ?, ?, null)
         on conflict(equipment_id, position) do nothing`,
      )
      .run(equipment.id, position, buildModSlotRoleAt(slot, position));
    sqlite
      .prepare(
        `
      insert into build_mods (id, equipment_id, position, entity_id, rank) values (?, ?, ?, ?, ?)
      on conflict(equipment_id, position) do update set entity_id = excluded.entity_id, rank = excluded.rank
    `,
      )
      .run(
        randomUUID(),
        equipment.id,
        position,
        mod.id,
        rank ?? mod.modMaxRank ?? null,
      );
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
    select entity_id as entityId, count(*) as quantity,
      max(is_helminth_donor) as isHelminthDonor from (
      select entity_id, 0 as is_helminth_donor from build_equipment where build_id = ?
      union all
      select part.entity_id, 0 from build_modular_parts part join build_equipment equipment on equipment.id = part.equipment_id where equipment.build_id = ?
      union all
      select mod.entity_id, 0 from build_mods mod join build_equipment equipment on equipment.id = mod.equipment_id where equipment.build_id = ?
      union all
      select entity_id, 0 from build_enhancements where build_id = ?
      union all
      select entityId, 1 from (
        select donor.id as entityId
        from build_ability_replacements replacement
        join entity_relations relation on relation.to_entity_id = replacement.replacement_ability_id
          and relation.kind = 'involves'
        join source_runs run on run.id = relation.source_run_id and run.status = 'active'
        join entities donor on donor.id = relation.from_entity_id and donor.kind = 'warframe'
        where replacement.build_id = ?
        order by case when donor.name like '% Prime' then 1 else 0 end,
          length(donor.name), donor.name collate nocase
        limit 1
      )
    ) group by entity_id
  `,
    )
    .all(buildId, buildId, buildId, buildId, buildId) as Array<{
    entityId: string;
    quantity: number;
    isHelminthDonor: number;
  }>;
  const inventory = sqlite.prepare(
    "select coalesce(owned_count, 0) + coalesce(built_count, 0) as available, subsumed from player_inventory where user_id = ? and entity_id = ?",
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
      const inventoryEntry = inventory.get(userId, requirement.entityId) as
        { available: number; subsumed: number } | undefined;
      if (requirement.isHelminthDonor && inventoryEntry?.subsumed) continue;
      const available = inventoryEntry?.available ?? 0;
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
  const focusSchool = sqlite
    .prepare(
      `select entity.kind, entity.slug, entity.name, entity.description
       from player_builds build join entities entity on entity.id = build.focus_school_entity_id
       where build.id = ?`,
    )
    .get(build.id) as
    | { kind: string; slug: string; name: string; description: string | null }
    | undefined;
  const replacementRow = sqlite
    .prepare(
      `select original_ability_id as originalId, replacement_ability_id as replacementId
       from build_ability_replacements where build_id = ?`,
    )
    .get(build.id) as { originalId: string; replacementId: string } | undefined;
  const equipmentRows = sqlite
    .prepare(
      `
    select equipment.id, equipment.slot, equipment.notes, equipment.configuration,
      equipment.rank, entity.equipment_max_rank as equipmentMaxRank,
      equipment.forma_count as formaCount,
      equipment.capacity_upgrade as capacityUpgrade,
      entity.id as entityId, entity.kind, entity.slug, entity.name,
      entity.weapon_class as weaponClass
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
    weaponClass: WeaponClass | null;
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
  const modularPartsQuery = sqlite.prepare(`
    select part.role, entity.kind, entity.slug, entity.name
    from build_modular_parts part join entities entity on entity.id = part.entity_id
    where part.equipment_id = ? order by part.role
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
    ...(focusSchool
      ? {
          focusSchool: {
            kind: focusSchool.kind,
            slug: focusSchool.slug,
            name: focusSchool.name,
            ...(focusSchool.description
              ? { description: focusSchool.description }
              : {}),
          },
        }
      : {}),
    ...(replacementRow
      ? {
          abilityReplacement: {
            original: hydrateAbility(sqlite, replacementRow.originalId),
            replacement: hydrateAbility(sqlite, replacementRow.replacementId),
          },
        }
      : {}),
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
          const effectiveRank = rank ?? modMaxRank ?? undefined;
          const drain = calculateRankedModDrain(
            modBaseDrain ?? undefined,
            effectiveRank,
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
            rank: effectiveRank,
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
      const modularParts = (
        modularPartsQuery.all(entry.id) as Array<{
          role: ModularPartRole;
          kind: string;
          slug: string;
          name: string;
        }>
      ).map(({ role, kind, slug, name }) => ({
        role,
        entity: { kind, slug, name },
      }));
      const attributes = listActiveBuildAttributes(sqlite, entry.entityId);
      const passive = attributes.find(({ key }) => key === "passive");
      const stats = attributes.filter(({ key }) => key !== "passive");
      const abilities = ["warframe", "archwing"].includes(entry.slot)
        ? listEquipmentAbilities(sqlite, entry.entityId)
        : [];
      return {
        id: entry.id,
        slot: entry.slot,
        entity: { kind: entry.kind, slug: entry.slug, name: entry.name },
        notes: entry.notes ?? undefined,
        configuration: entry.configuration ?? undefined,
        rank: entry.rank ?? entry.equipmentMaxRank ?? undefined,
        ...(entry.equipmentMaxRank !== null
          ? { maxRank: entry.equipmentMaxRank }
          : {}),
        formaCount: entry.formaCount,
        capacityUpgrade: Boolean(entry.capacityUpgrade),
        ...(stats.length ? { stats } : {}),
        ...(passive ? { passive } : {}),
        ...(abilities.length ? { abilities } : {}),
        modularPartRoles: modularPartRolesForWeaponClass(
          entry.weaponClass ?? undefined,
        ),
        modularParts,
        ...(factoryPolaritySets.length ? { factoryPolaritySets } : {}),
        ...(entry.slot === "operator-amp"
          ? {}
          : {
              capacity: calculateBuildCapacity(
                entry.equipmentMaxRank ?? undefined,
                entry.equipmentMaxRank ?? undefined,
                undefined,
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

function listActiveBuildAttributes(
  sqlite: Database.Database,
  entityId: string,
): BuildStat[] {
  return sqlite
    .prepare(
      `with ranked as (
         select attribute.key, attribute.label, attribute.value as baseValue,
           source.name as sourceName, attribute.citation_url as citationUrl,
           row_number() over (
             partition by attribute.key
             order by source.priority desc, run.retrieved_at desc,
               source.id, attribute.source_record_key
           ) as preference
         from entity_attributes attribute
         join source_runs run on run.id = attribute.source_run_id and run.status = 'active'
         join sources source on source.id = run.source_id
         where attribute.entity_id = ?
       )
       select key, label, baseValue, sourceName, citationUrl
       from ranked where preference = 1 order by key`,
    )
    .all(entityId) as BuildStat[];
}

function hydrateAbility(
  sqlite: Database.Database,
  entityId: string,
): BuildAbility {
  const entity = sqlite
    .prepare(
      "select kind, slug, name, description from entities where id = ? and kind = 'ability'",
    )
    .get(entityId) as
    | { kind: string; slug: string; name: string; description: string | null }
    | undefined;
  if (!entity) throw new Error("Build ability is unavailable");
  const attributes = listActiveBuildAttributes(sqlite, entityId);
  const slot = Number(
    attributes.find(({ key }) => key === "ability-slot")?.baseValue ?? 0,
  );
  const eligibility = attributes.find(({ key }) => key === "helminth-eligible");
  return {
    kind: entity.kind,
    slug: entity.slug,
    name: entity.name,
    ...(entity.description ? { description: entity.description } : {}),
    slot: Number.isSafeInteger(slot) ? slot : 0,
    helminthEligible: eligibility?.baseValue === "true",
    ...(eligibility
      ? {
          sourceName: eligibility.sourceName,
          ...(eligibility.citationUrl
            ? { citationUrl: eligibility.citationUrl }
            : {}),
        }
      : {}),
  };
}

function abilityBelongsTo(
  sqlite: Database.Database,
  equipmentEntityId: string,
  abilityEntityId: string,
): boolean {
  return Boolean(
    sqlite
      .prepare(
        `select 1 from entity_relations relation
         join source_runs run on run.id = relation.source_run_id and run.status = 'active'
         where relation.from_entity_id = ? and relation.to_entity_id = ?
           and relation.kind = 'involves' limit 1`,
      )
      .get(equipmentEntityId, abilityEntityId),
  );
}

function listEquipmentAbilities(
  sqlite: Database.Database,
  equipmentEntityId: string,
): BuildAbility[] {
  const rows = sqlite
    .prepare(
      `select distinct ability.id
       from entity_relations relation
       join source_runs run on run.id = relation.source_run_id and run.status = 'active'
       join entities ability on ability.id = relation.to_entity_id
       where relation.from_entity_id = ? and relation.kind = 'involves'
         and ability.kind = 'ability' and ability.retired = 0`,
    )
    .all(equipmentEntityId) as Array<{ id: string }>;
  return rows
    .map(({ id }) => hydrateAbility(sqlite, id))
    .sort(
      (left, right) =>
        left.slot - right.slot || left.name.localeCompare(right.name),
    );
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
  modularPartRole?: ModularPartRole;
} {
  const entity = sqlite
    .prepare(
      "select id, kind, name, arcane_class as arcaneClass, weapon_class as weaponClass, modular_part_role as modularPartRole, mod_max_rank as modMaxRank from entities where kind = ? and slug = ? and retired = 0",
    )
    .get(reference.kind, reference.slug) as
    | {
        id: string;
        kind: string;
        name: string;
        arcaneClass?: ArcaneClass;
        weaponClass?: WeaponClass;
        modMaxRank: number | null;
        modularPartRole?: ModularPartRole;
      }
    | undefined;
  if (!entity)
    throw new Error(
      `Unknown active entity ${reference.kind}:${reference.slug}`,
    );
  return entity;
}
function modularRolesForEquippedSlot(
  sqlite: Database.Database,
  buildId: string,
  slot: BuildSlot,
): ModularPartRole[] {
  if (!(BUILD_SLOTS as readonly string[]).includes(slot))
    throw new Error("Build slot is invalid");
  const row = sqlite
    .prepare(
      `select entity.weapon_class as weaponClass
       from build_equipment equipment join entities entity on entity.id = equipment.entity_id
       where equipment.build_id = ? and equipment.slot = ?`,
    )
    .get(buildId, slot) as { weaponClass: WeaponClass | null } | undefined;
  if (!row) throw new Error("Build equipment not found");
  return modularPartRolesForWeaponClass(row.weaponClass ?? undefined);
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
