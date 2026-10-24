import { createDecipheriv, createHash } from "node:crypto";
import type Database from "better-sqlite3";
import {
  configureBuildEquipment,
  createPlayerBuild,
  setBuildEnhancement,
  setBuildEquipment,
  setBuildMod,
  setBuildModSlot,
  type BuildEnhancementSlot,
  type BuildModSlotRole,
  type BuildSlot,
} from "./builds.ts";
import { getPlayerSettings, setPlayerProgression } from "./player.ts";
import type { ModPolarity } from "@ordis-prime/domain";

const ALECAFRAME_KEY = Buffer.from("LEO-ALEC\tEO-ALEC", "utf8");
const ALECAFRAME_IV = Buffer.from([
  49, 50, 70, 71, 66, 51, 54, 45, 76, 69, 51, 45, 113, 61, 57, 0,
]);
const MAX_RECORDS = 100_000;
const MAX_ITEM_COUNT = 1_000_000;
const RANK_30_XP = 900_000;
const MAX_UNRESOLVED = 50;

const UNIQUE_ITEM_GROUPS = [
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
] as const;

const STACKABLE_ITEM_GROUPS = [
  "RawUpgrades",
  "Upgrades",
  "MiscItems",
  "Consumables",
  "Recipes",
] as const;

export type AlecaFrameImportMode = "merge" | "replace";

export interface AlecaFrameImportOptions {
  mode: AlecaFrameImportMode;
  includeInventory: boolean;
  includeProgression: boolean;
  createBuild: boolean;
  buildTitle?: string;
}

export interface AlecaFrameInventoryChange {
  kind: string;
  slug: string;
  name: string;
  owned: { before: number; after: number };
  built: { before: number; after: number };
  mastered: { before?: boolean; after?: boolean };
  subsumed: { before?: boolean; after?: boolean };
}

export interface AlecaFrameImportPreview {
  snapshotHash: string;
  sourceTimestamp?: string;
  parsedRecords: number;
  inventory: {
    resolvedItems: number;
    changedItems: number;
    decreasedItems: number;
    unresolvedCount: number;
    unresolvedItemTypes: string[];
    changes: AlecaFrameInventoryChange[];
  };
  progression: {
    masteryRank?: { before?: number; after: number };
    highestWarframeRank?: { before?: number; after: number };
  };
  loadout: {
    equipment: Array<{
      slot: BuildSlot;
      name: string;
      configuration?: string;
      mods: number;
      enhancements: number;
    }>;
    unresolvedCount: number;
    unresolved: string[];
  };
  warnings: string[];
}

export interface AlecaFrameImportResult extends AlecaFrameImportPreview {
  applied: true;
  buildId?: string;
}

export type PlayerDataImportPreview = AlecaFrameImportPreview;
export type PlayerDataImportResult = AlecaFrameImportResult;

interface ParsedSnapshot {
  raw: Record<string, unknown>;
  parsedRecords: number;
  sourceTimestamp?: string;
  assertions: Map<string, InventoryAssertion>;
  xp: Map<string, number>;
  masteryRank?: number;
  highestWarframeRank?: number;
}

interface InventoryAssertion {
  owned: number;
  built: number;
  mastered?: boolean;
  subsumed?: boolean;
}

interface ResolvedEntity {
  id: string;
  kind: string;
  slug: string;
  name: string;
  equipmentMaxRank?: number;
}

interface ResolvedAssertion extends InventoryAssertion {
  entity: ResolvedEntity;
}

interface CurrentInventoryRow {
  entity: ResolvedEntity;
  owned: number;
  built: number;
  wanted: number;
  mastered?: boolean;
  subsumed?: boolean;
  note?: string;
}

interface ResolvedMod {
  position: number;
  role: BuildModSlotRole;
  polarity?: ModPolarity;
  entity: ResolvedEntity;
  rank?: number;
}

interface ResolvedModSlot {
  position: number;
  role: BuildModSlotRole;
  polarity?: ModPolarity;
}

interface ResolvedEnhancement {
  slot: BuildEnhancementSlot;
  entity: ResolvedEntity;
  rank?: number;
}

interface ResolvedEquipment {
  slot: BuildSlot;
  entity: ResolvedEntity;
  configuration?: string;
  rank?: number;
  formaCount: number;
  mods: ResolvedMod[];
  modSlots: ResolvedModSlot[];
  enhancements: ResolvedEnhancement[];
}

interface ResolvedLoadout {
  equipment: ResolvedEquipment[];
  unresolved: string[];
  warnings: string[];
}

export function decryptAlecaFrameSnapshot(bytes: Uint8Array): unknown {
  if (!bytes.byteLength || bytes.byteLength % 16 !== 0)
    throw new Error("AlecaFrame snapshot is not valid AES-CBC ciphertext");
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv(
      "aes-128-cbc",
      ALECAFRAME_KEY,
      ALECAFRAME_IV,
    );
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(bytes)),
      decipher.final(),
    ]);
  } catch {
    throw new Error("AlecaFrame snapshot could not be decrypted");
  }
  let outer: unknown;
  try {
    outer = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
    );
  } catch {
    throw new Error("AlecaFrame snapshot did not contain valid JSON");
  }
  if (!isRecord(outer))
    throw new Error("AlecaFrame snapshot must contain a JSON object");
  const nested = outer.InventoryJson;
  if (nested === undefined) return outer;
  let inventory: unknown;
  if (typeof nested === "string") {
    try {
      inventory = JSON.parse(nested);
    } catch {
      throw new Error("AlecaFrame InventoryJson is not valid JSON");
    }
  } else {
    inventory = nested;
  }
  if (!isRecord(inventory))
    throw new Error("AlecaFrame InventoryJson must contain a JSON object");
  const normalized = { ...outer, ...inventory };
  delete normalized.InventoryJson;
  return normalized;
}

export function decodeWarframeInventoryJson(bytes: Uint8Array): unknown {
  if (!bytes.byteLength) throw new Error("Warframe inventory is empty");
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("Warframe inventory did not contain valid UTF-8 JSON");
  }
  if (!isRecord(raw))
    throw new Error("Warframe inventory must contain a JSON object");
  return raw;
}

export function previewAlecaFrameImport(
  sqlite: Database.Database,
  userId: string,
  bytes: Uint8Array,
  options: AlecaFrameImportOptions,
): AlecaFrameImportPreview {
  validateOptions(options);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const parsed = parseSnapshot(decryptAlecaFrameSnapshot(bytes));
  return buildPreview(sqlite, userId, hash, parsed, options, "AlecaFrame")
    .preview;
}

export function applyAlecaFrameImport(
  sqlite: Database.Database,
  userId: string,
  bytes: Uint8Array,
  expectedHash: string,
  options: AlecaFrameImportOptions,
): AlecaFrameImportResult {
  validateOptions(options);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || hash !== expectedHash)
    throw new Error("AlecaFrame snapshot changed after preview");
  const parsed = parseSnapshot(decryptAlecaFrameSnapshot(bytes));
  const built = buildPreview(
    sqlite,
    userId,
    hash,
    parsed,
    options,
    "AlecaFrame",
  );
  let buildId: string | undefined;
  sqlite.transaction(() => {
    if (options.includeInventory)
      applyInventory(sqlite, userId, built.assertions, options.mode);
    if (options.includeProgression && built.nextSettings)
      setPlayerProgression(sqlite, userId, built.nextSettings);
    if (options.createBuild) {
      if (!built.loadout.equipment.length)
        throw new Error("AlecaFrame snapshot contains no supported loadout");
      buildId = createImportedBuild(
        sqlite,
        userId,
        options.buildTitle ?? defaultBuildTitle(parsed.sourceTimestamp),
        parsed.sourceTimestamp,
        built.loadout,
      );
    }
  })();
  return { ...built.preview, applied: true, ...(buildId ? { buildId } : {}) };
}

export function applyWarframeApiHelperImport(
  sqlite: Database.Database,
  userId: string,
  bytes: Uint8Array,
): PlayerDataImportResult {
  const options: AlecaFrameImportOptions = {
    mode: "merge",
    includeInventory: true,
    includeProgression: true,
    createBuild: false,
  };
  const hash = createHash("sha256").update(bytes).digest("hex");
  const parsed = parseSnapshot(decodeWarframeInventoryJson(bytes));
  const built = buildPreview(
    sqlite,
    userId,
    hash,
    parsed,
    options,
    "Warframe API helper",
  );
  sqlite.transaction(() => {
    applyInventory(sqlite, userId, built.assertions, "merge");
    if (built.nextSettings)
      setPlayerProgression(sqlite, userId, built.nextSettings);
  })();
  return { ...built.preview, applied: true };
}

function parseSnapshot(raw: unknown): ParsedSnapshot {
  if (!isRecord(raw)) throw new Error("AlecaFrame inventory must be an object");
  const assertions = new Map<string, InventoryAssertion>();
  let parsedRecords = 0;
  let presentGroups = 0;
  for (const group of UNIQUE_ITEM_GROUPS) {
    const value = raw[group];
    if (value === undefined) continue;
    presentGroups += 1;
    if (!Array.isArray(value))
      throw new Error(`AlecaFrame ${group} must be an array`);
    for (const [index, entry] of value.entries()) {
      parsedRecords = countRecord(parsedRecords);
      const itemType = recordItemType(entry, group, index);
      const assertion = assertionFor(assertions, itemType);
      assertion.built = safeAdd(assertion.built, 1);
    }
  }
  for (const group of STACKABLE_ITEM_GROUPS) {
    const value = raw[group];
    if (value === undefined) continue;
    presentGroups += 1;
    if (!Array.isArray(value))
      throw new Error(`AlecaFrame ${group} must be an array`);
    for (const [index, entry] of value.entries()) {
      parsedRecords = countRecord(parsedRecords);
      const itemType = recordItemType(entry, group, index);
      const quantity = itemQuantity(
        (entry as Record<string, unknown>).ItemCount,
        group,
        index,
      );
      if (!quantity) continue;
      const assertion = assertionFor(assertions, itemType);
      assertion.owned = safeAdd(assertion.owned, quantity);
    }
  }
  if (!presentGroups)
    throw new Error(
      "AlecaFrame snapshot contains no supported inventory groups",
    );

  const xp = new Map<string, number>();
  if (raw.XPInfo !== undefined) {
    if (!Array.isArray(raw.XPInfo))
      throw new Error("AlecaFrame XPInfo must be an array");
    for (const [index, entry] of raw.XPInfo.entries()) {
      parsedRecords = countRecord(parsedRecords);
      const itemType = recordItemType(entry, "XPInfo", index);
      const value = (entry as Record<string, unknown>).XP;
      if (!Number.isSafeInteger(value) || (value as number) < 0)
        throw new Error(`AlecaFrame XPInfo[${index}].XP is invalid`);
      xp.set(itemType, value as number);
    }
  }

  const foundry = raw.InfestedFoundry;
  if (foundry !== undefined) {
    if (!isRecord(foundry))
      throw new Error("AlecaFrame InfestedFoundry is invalid");
    const consumed = foundry.ConsumedSuits ?? [];
    if (!Array.isArray(consumed))
      throw new Error("AlecaFrame InfestedFoundry.ConsumedSuits is invalid");
    for (const [index, entry] of consumed.entries()) {
      parsedRecords = countRecord(parsedRecords);
      if (!isRecord(entry) || !isItemType(entry.s))
        throw new Error(
          `AlecaFrame InfestedFoundry.ConsumedSuits[${index}] is invalid`,
        );
      assertionFor(assertions, entry.s).subsumed = true;
    }
  }

  const masteryRank = optionalInteger(raw.PlayerLevel, 0, 40, "PlayerLevel");
  const suits = raw.Suits as unknown[] | undefined;
  const suitXp = (suits ?? [])
    .filter(isRecord)
    .map((entry) => entry.XP)
    .filter(
      (value): value is number =>
        Number.isSafeInteger(value) && (value as number) >= 0,
    );
  const highestWarframeRank = suitXp.some((value) => value >= RANK_30_XP)
    ? 30
    : suits?.length &&
        suitXp.length === suits.length &&
        suitXp.every((value) => value === 0)
      ? 0
      : undefined;
  return {
    raw,
    parsedRecords,
    sourceTimestamp: parseSourceTimestamp(raw.LastInventorySync),
    assertions,
    xp,
    masteryRank,
    highestWarframeRank,
  };
}

function buildPreview(
  sqlite: Database.Database,
  userId: string,
  hash: string,
  parsed: ParsedSnapshot,
  options: AlecaFrameImportOptions,
  sourceLabel: string,
): {
  preview: AlecaFrameImportPreview;
  assertions: Map<string, ResolvedAssertion>;
  loadout: ResolvedLoadout;
  nextSettings?: ReturnType<typeof getPlayerSettings>;
} {
  if (!sqlite.prepare("select 1 from users where id = ?").get(userId))
    throw new Error("Unknown user");
  const unresolved = new Set<string>();
  const assertions = new Map<string, ResolvedAssertion>();
  for (const [path, assertion] of parsed.assertions) {
    const entity = resolveEntity(sqlite, path);
    if (!entity) {
      unresolved.add(path);
      continue;
    }
    assertions.set(
      entity.id,
      mergeAssertions(assertions.get(entity.id), entity, assertion),
    );
  }
  for (const [path, xp] of parsed.xp) {
    const entity = resolveEntity(sqlite, path);
    if (!entity) {
      unresolved.add(path);
      continue;
    }
    if (
      xp >= RANK_30_XP &&
      entity.equipmentMaxRank !== undefined &&
      entity.equipmentMaxRank <= 30
    ) {
      const current = assertions.get(entity.id) ?? {
        entity,
        owned: 0,
        built: 0,
      };
      current.mastered = true;
      assertions.set(entity.id, current);
    }
  }

  const current = currentInventory(sqlite, userId);
  const comparisonIds = new Set(assertions.keys());
  if (options.includeInventory && options.mode === "replace")
    for (const id of current.keys()) comparisonIds.add(id);
  const changes: AlecaFrameInventoryChange[] = [];
  let changedItems = 0;
  let decreasedItems = 0;
  for (const id of comparisonIds) {
    const before = current.get(id);
    const incoming = assertions.get(id);
    const entity = incoming?.entity ?? before?.entity;
    if (!entity) continue;
    const after = targetInventory(before, incoming, options.mode);
    if (!inventoryChanged(before, after)) continue;
    changedItems += 1;
    if (
      after.owned < (before?.owned ?? 0) ||
      after.built < (before?.built ?? 0) ||
      (before?.mastered === true && after.mastered !== true) ||
      (before?.subsumed === true && after.subsumed !== true)
    )
      decreasedItems += 1;
    if (changes.length < MAX_UNRESOLVED)
      changes.push({
        kind: entity.kind,
        slug: entity.slug,
        name: entity.name,
        owned: { before: before?.owned ?? 0, after: after.owned },
        built: { before: before?.built ?? 0, after: after.built },
        mastered: { before: before?.mastered, after: after.mastered },
        subsumed: { before: before?.subsumed, after: after.subsumed },
      });
  }

  const settings = getPlayerSettings(sqlite, userId);
  const nextSettings = { ...settings };
  const progression: AlecaFrameImportPreview["progression"] = {};
  if (options.includeProgression && parsed.masteryRank !== undefined) {
    const after =
      options.mode === "merge"
        ? Math.max(settings.masteryRank ?? 0, parsed.masteryRank)
        : parsed.masteryRank;
    if (after !== settings.masteryRank) {
      progression.masteryRank = { before: settings.masteryRank, after };
      nextSettings.masteryRank = after;
    }
  }
  if (options.includeProgression && parsed.highestWarframeRank !== undefined) {
    const after =
      options.mode === "merge"
        ? Math.max(
            settings.highestWarframeRank ?? 0,
            parsed.highestWarframeRank,
          )
        : parsed.highestWarframeRank;
    if (after !== settings.highestWarframeRank) {
      progression.highestWarframeRank = {
        before: settings.highestWarframeRank,
        after,
      };
      nextSettings.highestWarframeRank = after;
    }
  }

  const loadout = resolveLoadout(sqlite, parsed.raw);
  const warnings = [...loadout.warnings];
  if (!parsed.sourceTimestamp)
    warnings.push(
      `${sourceLabel} did not provide a valid LastInventorySync timestamp.`,
    );
  warnings.push(
    "Catalyst, Reactor, adapter, partial equipment-rank, Archon Shard, and Helminth configuration state are not inferred.",
  );
  return {
    assertions,
    loadout,
    nextSettings:
      Object.keys(progression).length > 0 ? nextSettings : undefined,
    preview: {
      snapshotHash: hash,
      sourceTimestamp: parsed.sourceTimestamp,
      parsedRecords: parsed.parsedRecords,
      inventory: {
        resolvedItems: assertions.size,
        changedItems: options.includeInventory ? changedItems : 0,
        decreasedItems: options.includeInventory ? decreasedItems : 0,
        unresolvedCount: unresolved.size,
        unresolvedItemTypes: [...unresolved].sort().slice(0, MAX_UNRESOLVED),
        changes: options.includeInventory ? changes : [],
      },
      progression,
      loadout: {
        equipment: loadout.equipment.map((entry) => ({
          slot: entry.slot,
          name: entry.entity.name,
          configuration: entry.configuration,
          mods: entry.mods.length,
          enhancements: entry.enhancements.length,
        })),
        unresolvedCount: loadout.unresolved.length,
        unresolved: loadout.unresolved.slice(0, MAX_UNRESOLVED),
      },
      warnings,
    },
  };
}

function resolveLoadout(
  sqlite: Database.Database,
  raw: Record<string, unknown>,
): ResolvedLoadout {
  const unresolved: string[] = [];
  const warnings: string[] = [];
  const itemCopies = new Map<string, Record<string, unknown>>();
  for (const group of UNIQUE_ITEM_GROUPS) {
    const entries = raw[group];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!isRecord(entry)) continue;
      const id = objectId(entry.ItemId);
      if (id) itemCopies.set(id, entry);
    }
  }
  const upgrades = new Map<string, Record<string, unknown>>();
  if (Array.isArray(raw.Upgrades))
    for (const entry of raw.Upgrades) {
      if (!isRecord(entry)) continue;
      const id = objectId(entry.ItemId);
      if (id) upgrades.set(id, entry);
    }
  const presets = isRecord(raw.LoadOutPresets) ? raw.LoadOutPresets : {};
  const mappings: Array<{
    slot: BuildSlot;
    preset: "NORMAL" | "SENTINEL";
    key: string;
  }> = [
    { slot: "warframe", preset: "NORMAL", key: "s" },
    { slot: "primary", preset: "NORMAL", key: "l" },
    { slot: "secondary", preset: "NORMAL", key: "p" },
    { slot: "melee", preset: "NORMAL", key: "m" },
    { slot: "companion", preset: "SENTINEL", key: "s" },
    { slot: "companion-weapon", preset: "SENTINEL", key: "l" },
  ];
  const equipment: ResolvedEquipment[] = [];
  for (const mapping of mappings) {
    const list = presets[mapping.preset];
    const preset: Record<string, unknown> | undefined =
      Array.isArray(list) && isRecord(list[0]) ? list[0] : undefined;
    const candidate = preset?.[mapping.key];
    const reference: Record<string, unknown> | undefined = isRecord(candidate)
      ? candidate
      : undefined;
    if (!reference) continue;
    const itemId = objectId(reference.ItemId);
    const item = itemId ? itemCopies.get(itemId) : undefined;
    if (!item || !isItemType(item.ItemType)) {
      unresolved.push(
        `${mapping.slot}: equipment copy ${itemId ?? "unknown"} was not found`,
      );
      continue;
    }
    const entity = resolveEntity(sqlite, item.ItemType);
    if (!entity) {
      unresolved.push(`${mapping.slot}: ${item.ItemType}`);
      continue;
    }
    const configIndex = Number.isSafeInteger(reference.mod)
      ? (reference.mod as number)
      : undefined;
    const configs = Array.isArray(item.Configs) ? item.Configs : [];
    const config =
      configIndex !== undefined && isRecord(configs[configIndex])
        ? configs[configIndex]
        : undefined;
    const configuration =
      configIndex !== undefined
        ? configurationLabel(configIndex, config)
        : undefined;
    const formaCount =
      Number.isSafeInteger(item.Polarized) && (item.Polarized as number) >= 0
        ? Math.min(item.Polarized as number, 100)
        : 0;
    const rank =
      item.XP === 0
        ? 0
        : Number.isSafeInteger(item.XP) &&
            (item.XP as number) >= RANK_30_XP &&
            entity.equipmentMaxRank !== undefined &&
            entity.equipmentMaxRank <= 30
          ? entity.equipmentMaxRank
          : undefined;
    const polarities = loadoutPolarities(mapping.slot, item, warnings);
    const mods: ResolvedMod[] = [];
    const enhancements: ResolvedEnhancement[] = [];
    if (
      (mapping.slot === "companion" || mapping.slot === "companion-weapon") &&
      config &&
      Array.isArray(config.Upgrades) &&
      config.Upgrades.some(Boolean)
    ) {
      warnings.push(
        `${entity.name}: companion mod placement was not imported because its slot mapping is unverified.`,
      );
    } else if (config && Array.isArray(config.Upgrades)) {
      for (const [savePosition, rawUpgrade] of config.Upgrades.entries()) {
        if (
          rawUpgrade === null ||
          rawUpgrade === undefined ||
          rawUpgrade === ""
        )
          continue;
        const resolvedUpgrade = resolveLoadoutUpgrade(
          sqlite,
          upgrades,
          rawUpgrade,
        );
        if (!resolvedUpgrade) {
          unresolved.push(
            `${mapping.slot} config ${configuration ?? "unknown"} slot ${savePosition}`,
          );
          continue;
        }
        if (resolvedUpgrade.rank === undefined) {
          unresolved.push(
            `${mapping.slot} config ${configuration ?? "unknown"} slot ${savePosition}: ${resolvedUpgrade.entity.name} rank is unknown`,
          );
          continue;
        }
        const enhancementSlot = enhancementSlotAt(mapping.slot, savePosition);
        if (enhancementSlot) {
          if (resolvedUpgrade.entity.kind !== "arcane") {
            unresolved.push(
              `${mapping.slot} ${enhancementSlot}: ${resolvedUpgrade.entity.name} is not an Arcane`,
            );
            continue;
          }
          enhancements.push({
            slot: enhancementSlot,
            entity: resolvedUpgrade.entity,
            rank: resolvedUpgrade.rank,
          });
          continue;
        }
        const target = modSlotAt(mapping.slot, savePosition);
        if (!target) {
          warnings.push(
            `${entity.name}: save slot ${savePosition} is not supported by the build editor.`,
          );
          continue;
        }
        if (resolvedUpgrade.entity.kind !== "mod") {
          unresolved.push(
            `${mapping.slot} slot ${savePosition}: ${resolvedUpgrade.entity.name} is not a Mod`,
          );
          continue;
        }
        mods.push({
          ...target,
          entity: resolvedUpgrade.entity,
          rank: resolvedUpgrade.rank,
          polarity: polarities.get(target.position),
        });
      }
    }
    equipment.push({
      slot: mapping.slot,
      entity,
      configuration,
      rank,
      formaCount,
      mods,
      modSlots: [...polarities.entries()].flatMap(([position, polarity]) => {
        const role = roleAtTargetPosition(mapping.slot, position);
        return role ? [{ position, role, polarity }] : [];
      }),
      enhancements,
    });
  }
  for (const preset of [
    "ARCHWING",
    "OPERATOR",
    "OPERATOR_ADULT",
    "DRIFTER",
    "MECH",
  ])
    if (Array.isArray(presets[preset]) && (presets[preset] as unknown[]).length)
      warnings.push(
        `${preset} loadout data is present but does not yet have a verified import mapping.`,
      );
  return { equipment, unresolved, warnings };
}

function createImportedBuild(
  sqlite: Database.Database,
  userId: string,
  title: string,
  sourceTimestamp: string | undefined,
  loadout: ResolvedLoadout,
): string {
  const id = createPlayerBuild(sqlite, userId, {
    title,
    category: "Imported",
    notes: `Imported from an AlecaFrame snapshot${sourceTimestamp ? ` last synchronized ${sourceTimestamp}` : ""}. Catalyst/Reactor, adapters, partial equipment ranks, Archon Shards, and unsupported configurations were not inferred.`,
  });
  for (const equipment of loadout.equipment) {
    setBuildEquipment(sqlite, userId, id, equipment.slot, equipment.entity);
    configureBuildEquipment(sqlite, userId, id, equipment.slot, {
      configuration: equipment.configuration,
      rank: equipment.rank,
      formaCount: equipment.formaCount,
      capacityUpgrade: false,
    });
    for (const slot of equipment.modSlots)
      setBuildModSlot(
        sqlite,
        userId,
        id,
        equipment.slot,
        slot.position,
        slot.role,
        slot.polarity,
      );
    for (const mod of equipment.mods)
      setBuildMod(
        sqlite,
        userId,
        id,
        equipment.slot,
        mod.position,
        mod.entity,
        mod.rank,
      );
    for (const enhancement of equipment.enhancements)
      setBuildEnhancement(
        sqlite,
        userId,
        id,
        enhancement.slot,
        enhancement.entity,
        enhancement.rank,
      );
  }
  return id;
}

function applyInventory(
  sqlite: Database.Database,
  userId: string,
  assertions: Map<string, ResolvedAssertion>,
  mode: AlecaFrameImportMode,
) {
  const now = Date.now();
  if (mode === "replace")
    sqlite
      .prepare(
        `update player_inventory
         set owned_count = 0, built_count = 0, mastered = null, subsumed = null, updated_at = ?
         where user_id = ? and entity_id in (
           select distinct entity_id from external_ids
           where source_id = 'wfcd-items' and namespace = 'uniqueName'
         )`,
      )
      .run(now, userId);
  const writeMerge = sqlite.prepare(`
    insert into player_inventory
      (user_id, entity_id, owned_count, built_count, wanted_count, mastered, subsumed, note, updated_at)
    values (?, ?, ?, ?, 0, ?, ?, null, ?)
    on conflict(user_id, entity_id) do update set
      owned_count = max(player_inventory.owned_count, excluded.owned_count),
      built_count = max(player_inventory.built_count, excluded.built_count),
      mastered = case when excluded.mastered = 1 then 1 else player_inventory.mastered end,
      subsumed = case when excluded.subsumed = 1 then 1 else player_inventory.subsumed end,
      updated_at = excluded.updated_at
  `);
  const writeReplace = sqlite.prepare(`
    insert into player_inventory
      (user_id, entity_id, owned_count, built_count, wanted_count, mastered, subsumed, note, updated_at)
    values (?, ?, ?, ?, 0, ?, ?, null, ?)
    on conflict(user_id, entity_id) do update set
      owned_count = excluded.owned_count,
      built_count = excluded.built_count,
      mastered = excluded.mastered,
      subsumed = excluded.subsumed,
      updated_at = excluded.updated_at
  `);
  for (const assertion of assertions.values())
    (mode === "merge" ? writeMerge : writeReplace).run(
      userId,
      assertion.entity.id,
      assertion.owned,
      assertion.built,
      assertion.mastered === undefined ? null : assertion.mastered ? 1 : 0,
      assertion.subsumed === undefined ? null : assertion.subsumed ? 1 : 0,
      now,
    );
}

function resolveEntity(
  sqlite: Database.Database,
  path: string,
): ResolvedEntity | undefined {
  const rows = sqlite
    .prepare(
      `select entity.id, entity.kind, entity.slug, entity.name,
              entity.equipment_max_rank as equipmentMaxRank
       from external_ids identifier
       join entities entity on entity.id = identifier.entity_id
       where identifier.source_id = 'wfcd-items'
         and identifier.namespace = 'uniqueName'
         and identifier.value = ? and entity.retired = 0`,
    )
    .all(path) as Array<{
    id: string;
    kind: string;
    slug: string;
    name: string;
    equipmentMaxRank: number | null;
  }>;
  if (rows.length !== 1) return undefined;
  const row = rows[0]!;
  return {
    ...row,
    equipmentMaxRank: row.equipmentMaxRank ?? undefined,
  };
}

function currentInventory(
  sqlite: Database.Database,
  userId: string,
): Map<string, CurrentInventoryRow> {
  const rows = sqlite
    .prepare(
      `select inventory.entity_id as id, entity.kind, entity.slug, entity.name,
              entity.equipment_max_rank as equipmentMaxRank,
              inventory.owned_count as owned, inventory.built_count as built,
              inventory.wanted_count as wanted, inventory.mastered,
              inventory.subsumed, inventory.note
       from player_inventory inventory
       join entities entity on entity.id = inventory.entity_id
       where inventory.user_id = ? and exists (
         select 1 from external_ids identifier
         where identifier.entity_id = entity.id
           and identifier.source_id = 'wfcd-items'
           and identifier.namespace = 'uniqueName'
       )`,
    )
    .all(userId) as Array<{
    id: string;
    kind: string;
    slug: string;
    name: string;
    equipmentMaxRank: number | null;
    owned: number;
    built: number;
    wanted: number;
    mastered: number | null;
    subsumed: number | null;
    note: string | null;
  }>;
  return new Map(
    rows.map((row) => [
      row.id,
      {
        entity: {
          id: row.id,
          kind: row.kind,
          slug: row.slug,
          name: row.name,
          equipmentMaxRank: row.equipmentMaxRank ?? undefined,
        },
        owned: row.owned,
        built: row.built,
        wanted: row.wanted,
        mastered: sqlBoolean(row.mastered),
        subsumed: sqlBoolean(row.subsumed),
        note: row.note ?? undefined,
      },
    ]),
  );
}

function targetInventory(
  current: CurrentInventoryRow | undefined,
  incoming: ResolvedAssertion | undefined,
  mode: AlecaFrameImportMode,
) {
  if (mode === "replace")
    return {
      owned: incoming?.owned ?? 0,
      built: incoming?.built ?? 0,
      mastered: incoming?.mastered,
      subsumed: incoming?.subsumed,
    };
  return {
    owned: Math.max(current?.owned ?? 0, incoming?.owned ?? 0),
    built: Math.max(current?.built ?? 0, incoming?.built ?? 0),
    mastered: incoming?.mastered === true ? true : current?.mastered,
    subsumed: incoming?.subsumed === true ? true : current?.subsumed,
  };
}

function inventoryChanged(
  before: CurrentInventoryRow | undefined,
  after: ReturnType<typeof targetInventory>,
) {
  return (
    (before?.owned ?? 0) !== after.owned ||
    (before?.built ?? 0) !== after.built ||
    before?.mastered !== after.mastered ||
    before?.subsumed !== after.subsumed
  );
}

function resolveLoadoutUpgrade(
  sqlite: Database.Database,
  upgrades: Map<string, Record<string, unknown>>,
  raw: unknown,
): { entity: ResolvedEntity; rank?: number } | undefined {
  const id =
    typeof raw === "string"
      ? raw
      : isRecord(raw)
        ? (objectId(raw.ItemId) ??
          (typeof raw.ItemType === "string" ? raw.ItemType : undefined))
        : undefined;
  if (!id) return undefined;
  const copy = upgrades.get(id);
  const path =
    copy && isItemType(copy.ItemType)
      ? copy.ItemType
      : isItemType(id.startsWith("Lotus/") ? `/${id}` : id)
        ? id.startsWith("Lotus/")
          ? `/${id}`
          : id
        : undefined;
  if (!path) return undefined;
  const entity = resolveEntity(sqlite, path);
  if (!entity) return undefined;
  let rank: number | undefined;
  if (copy && typeof copy.UpgradeFingerprint === "string") {
    try {
      const fingerprint = JSON.parse(copy.UpgradeFingerprint) as unknown;
      if (
        isRecord(fingerprint) &&
        Number.isSafeInteger(fingerprint.lvl) &&
        (fingerprint.lvl as number) >= 0
      )
        rank = fingerprint.lvl as number;
    } catch {
      // A malformed fingerprint makes the rank unknown, not the mod identity.
    }
  }
  return { entity, rank };
}

function loadoutPolarities(
  slot: BuildSlot,
  item: Record<string, unknown>,
  warnings: string[],
): Map<number, ModPolarity> {
  const result = new Map<number, ModPolarity>();
  if (!Array.isArray(item.Polarity)) return result;
  if (slot === "companion" || slot === "companion-weapon") {
    if (item.Polarity.length)
      warnings.push(
        `Final polarities for ${slot} were not imported because its slot mapping is unverified.`,
      );
    return result;
  }
  for (const entry of item.Polarity) {
    if (
      !isRecord(entry) ||
      !Number.isSafeInteger(entry.Slot) ||
      typeof entry.Value !== "string"
    )
      continue;
    const target = modSlotAt(slot, entry.Slot as number);
    const polarity = POLARITY_MAP[entry.Value];
    if (!target || !polarity) continue;
    if (polarity === "universal") {
      warnings.push(
        `A universal polarity in ${slot} slot ${entry.Slot} is not supported by the editor.`,
      );
      continue;
    }
    result.set(target.position, polarity);
  }
  return result;
}

const POLARITY_MAP: Record<string, ModPolarity | undefined> = {
  AP_ATTACK: "madurai",
  AP_DEFENSE: "vazarin",
  AP_TACTIC: "naramon",
  AP_POWER: "zenurik",
  AP_UNIVERSAL: "universal",
  AP_WARD: "penjaga",
  AP_PRECEPT: "penjaga",
  AP_UMBRA: "umbra",
  AP_UNAIRU: "unairu",
};

function modSlotAt(
  slot: BuildSlot,
  savePosition: number,
): { position: number; role: BuildModSlotRole } | undefined {
  if (savePosition >= 0 && savePosition < 8)
    return { position: savePosition, role: "normal" };
  if (slot === "warframe" && savePosition === 8)
    return { position: 10, role: "aura" };
  if (slot === "melee" && savePosition === 8)
    return { position: 10, role: "stance" };
  if (
    ["warframe", "primary", "secondary", "melee"].includes(slot) &&
    savePosition === 9
  )
    return { position: 12, role: "exilus" };
  if (["primary", "secondary"].includes(slot) && savePosition === 8)
    return { position: 12, role: "exilus" };
  return undefined;
}

function enhancementSlotAt(
  slot: BuildSlot,
  savePosition: number,
): BuildEnhancementSlot | undefined {
  if (slot === "warframe" && savePosition === 10) return "warframe-arcane-1";
  if (slot === "warframe" && savePosition === 11) return "warframe-arcane-2";
  if (slot === "primary" && savePosition === 9) return "primary-arcane";
  if (slot === "secondary" && savePosition === 9) return "secondary-arcane";
  if (slot === "melee" && savePosition === 10) return "melee-arcane";
  return undefined;
}

function roleAtTargetPosition(
  slot: BuildSlot,
  position: number,
): BuildModSlotRole | undefined {
  if (position >= 0 && position < (slot === "companion" ? 10 : 8))
    return "normal";
  if (position === 10 && slot === "warframe") return "aura";
  if (position === 10 && slot === "melee") return "stance";
  if (
    position === 12 &&
    ["warframe", "primary", "secondary", "melee"].includes(slot)
  )
    return "exilus";
  return undefined;
}

function configurationLabel(index: number, config?: Record<string, unknown>) {
  const letter = ["A", "B", "C"][index] ?? `#${index + 1}`;
  const name = typeof config?.Name === "string" ? config.Name.trim() : "";
  return name && name !== letter ? `${letter} · ${name}` : letter;
}

function defaultBuildTitle(sourceTimestamp?: string) {
  const date = sourceTimestamp ? new Date(sourceTimestamp) : new Date();
  return `AlecaFrame loadout — ${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

function validateOptions(options: AlecaFrameImportOptions) {
  if (options.mode !== "merge" && options.mode !== "replace")
    throw new Error("AlecaFrame import mode is invalid");
  if (
    !options.includeInventory &&
    !options.includeProgression &&
    !options.createBuild
  )
    throw new Error("Select at least one AlecaFrame import category");
  if (options.buildTitle !== undefined) {
    const title = options.buildTitle.trim();
    if (!title || title.length > 120)
      throw new Error(
        "Imported build title must contain between 1 and 120 characters",
      );
  }
}

function mergeAssertions(
  current: ResolvedAssertion | undefined,
  entity: ResolvedEntity,
  incoming: InventoryAssertion,
): ResolvedAssertion {
  return {
    entity,
    owned: safeAdd(current?.owned ?? 0, incoming.owned),
    built: safeAdd(current?.built ?? 0, incoming.built),
    mastered: current?.mastered || incoming.mastered ? true : undefined,
    subsumed: current?.subsumed || incoming.subsumed ? true : undefined,
  };
}

function assertionFor(map: Map<string, InventoryAssertion>, path: string) {
  const assertion = map.get(path) ?? { owned: 0, built: 0 };
  map.set(path, assertion);
  return assertion;
}

function recordItemType(entry: unknown, group: string, index: number) {
  if (!isRecord(entry) || !isItemType(entry.ItemType))
    throw new Error(`AlecaFrame ${group}[${index}] is invalid`);
  return entry.ItemType;
}

function itemQuantity(value: unknown, group: string, index: number) {
  if (value === undefined) return 1;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > MAX_ITEM_COUNT
  )
    throw new Error(`AlecaFrame ${group}[${index}].ItemCount is invalid`);
  return value as number;
}

function countRecord(count: number) {
  const next = count + 1;
  if (next > MAX_RECORDS)
    throw new Error(`AlecaFrame snapshot exceeds ${MAX_RECORDS} records`);
  return next;
}

function safeAdd(left: number, right: number) {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total > MAX_ITEM_COUNT)
    throw new Error(`AlecaFrame inventory quantity exceeds ${MAX_ITEM_COUNT}`);
  return total;
}

function optionalInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
) {
  if (value === undefined || value === null) return undefined;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    throw new Error(
      `AlecaFrame ${label} must be between ${minimum} and ${maximum}`,
    );
  return value as number;
}

function parseSourceTimestamp(value: unknown): string | undefined {
  let candidate: unknown = value;
  if (isRecord(candidate) && "$date" in candidate) candidate = candidate.$date;
  if (isRecord(candidate) && "$numberLong" in candidate)
    candidate = candidate.$numberLong;
  if (typeof candidate === "string" && /^\d+$/.test(candidate))
    candidate = Number(candidate);
  const date =
    typeof candidate === "number" || typeof candidate === "string"
      ? new Date(candidate)
      : undefined;
  return date && !Number.isNaN(date.valueOf()) ? date.toISOString() : undefined;
}

function objectId(value: unknown) {
  if (typeof value === "string") return value;
  return isRecord(value) && typeof value.$oid === "string"
    ? value.$oid
    : undefined;
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

function sqlBoolean(value: number | null) {
  return value === null ? undefined : Boolean(value);
}
