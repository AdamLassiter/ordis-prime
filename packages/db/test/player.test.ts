import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type Database from "better-sqlite3";
import type { Observation } from "@ordis-prime/domain";
import {
  configureBuildEquipment,
  createLocalUser,
  createPlayerBuild,
  createPlayerTodo,
  createWorldStateWatch,
  exportPlayerProfile,
  findPlayerInventoryEntry,
  getDiscoveryProgress,
  getNodeCompletion,
  getPlayerSettings,
  importPlayerProfile,
  listPlayerBuilds,
  listPlayerGoals,
  listPlayerInventory,
  listPlayerTodos,
  listWorldStateWatches,
  migrateDatabase,
  openSqliteDatabase,
  promoteSource,
  setBuildEnhancement,
  setBuildEquipment,
  setBuildMod,
  setBuildModSlot,
  setDiscoveryProgress,
  setInventoryEntry,
  setInventoryEntryByReference,
  setNodeCompletion,
  setPlayerGoal,
  setPlayerMasteryRank,
  setPlayerRailjackIntrinsicRank,
  setPlayerRecipePreference,
  setPlayerTodoStatus,
} from "../src/index.ts";

test("profiles resolve stable source IDs across installations with different canonical UUIDs", async (context) => {
  const roots = await Promise.all(
    ["a", "b"].map((name) =>
      fs.mkdtemp(path.join(os.tmpdir(), `ordis-profile-${name}-`)),
    ),
  );
  context.after(() =>
    Promise.all(
      roots.map((root) => fs.rm(root, { recursive: true, force: true })),
    ),
  );
  const first = createCatalog(path.join(roots[0]!, "catalog.sqlite"));
  const second = createCatalog(path.join(roots[1]!, "catalog.sqlite"));
  context.after(() => {
    first.sqlite.close();
    second.sqlite.close();
  });
  assert.notEqual(first.entityId, second.entityId);

  const firstUser = createLocalUser(first.sqlite, { username: "Exporter" });
  setPlayerMasteryRank(first.sqlite, firstUser, 31);
  setPlayerRailjackIntrinsicRank(first.sqlite, firstUser, 7);
  assert.throws(
    () => setPlayerMasteryRank(first.sqlite, firstUser, 41),
    /between 0 and 40/,
  );
  assert.throws(
    () => setPlayerRailjackIntrinsicRank(first.sqlite, firstUser, 11),
    /between 0 and 10/,
  );
  setPlayerMasteryRank(first.sqlite, firstUser, undefined);
  assert.deepEqual(getPlayerSettings(first.sqlite, firstUser), {
    masteryRank: undefined,
    railjackIntrinsicRank: 7,
  });
  setPlayerMasteryRank(first.sqlite, firstUser, 31);
  setPlayerRailjackIntrinsicRank(first.sqlite, firstUser, undefined);
  assert.deepEqual(getPlayerSettings(first.sqlite, firstUser), {
    masteryRank: 31,
    railjackIntrinsicRank: undefined,
  });
  setPlayerRailjackIntrinsicRank(first.sqlite, firstUser, 7);
  assert.deepEqual(
    findPlayerInventoryEntry(first.sqlite, firstUser, "weapon", "braton"),
    {
      entityId: first.entityId,
      kind: "weapon",
      slug: "braton",
      name: "Braton",
      ownedCount: 0,
      builtCount: 0,
      wantedCount: 0,
      mastered: undefined,
      subsumed: undefined,
      note: undefined,
    },
  );
  setInventoryEntry(first.sqlite, firstUser, first.entityId, {
    ownedCount: 2,
    builtCount: 1,
    wantedCount: 3,
    mastered: true,
    note: "Keep one unranked.",
  });
  setPlayerGoal(first.sqlite, firstUser, { kind: "weapon", slug: "braton" }, 4);
  const recipeId = (
    first.sqlite
      .prepare("select id from recipes where output_id = ?")
      .get(first.entityId) as { id: string }
  ).id;
  setPlayerRecipePreference(
    first.sqlite,
    firstUser,
    { kind: "weapon", slug: "braton" },
    recipeId,
  );
  setDiscoveryProgress(
    first.sqlite,
    firstUser,
    { kind: "quest", slug: "awakening" },
    "completed",
  );
  setNodeCompletion(first.sqlite, firstUser, "e-prime", true);
  const todoDueAt = Date.parse("2027-01-31T00:00:00.000Z");
  const recurrence = { kind: "monthly-date", day: 31 } as const;
  const todoId = createPlayerTodo(first.sqlite, firstUser, {
    title: "Prepare",
    notes: "Before reset",
    dueAt: todoDueAt,
    recurrence,
    entity: { kind: "weapon", slug: "braton" },
  });
  setPlayerTodoStatus(first.sqlite, firstUser, todoId, "completed");
  createWorldStateWatch(first.sqlite, firstUser, {
    kind: "cycle",
    trigger: "ending",
    leadMinutes: 15,
    labelContains: "Cetus",
    entity: { kind: "weapon", slug: "braton" },
  });
  const buildId = createPlayerBuild(first.sqlite, firstUser, {
    title: "Portable build",
    category: "test",
    notes: "Moves across catalogs",
  });
  setBuildEquipment(
    first.sqlite,
    firstUser,
    buildId,
    "primary",
    { kind: "weapon", slug: "braton" },
    "Main weapon",
  );
  configureBuildEquipment(first.sqlite, firstUser, buildId, "primary", {
    configuration: "A",
    rank: 24,
    formaCount: 2,
    capacityUpgrade: true,
  });
  setBuildModSlot(
    first.sqlite,
    firstUser,
    buildId,
    "primary",
    0,
    "normal",
    "madurai",
  );
  setBuildMod(
    first.sqlite,
    firstUser,
    buildId,
    "primary",
    0,
    { kind: "mod", slug: "serration" },
    5,
  );
  setBuildEnhancement(
    first.sqlite,
    firstUser,
    buildId,
    "warframe-arcane-1",
    { kind: "arcane", slug: "arcane-barrier" },
    5,
  );
  setBuildEnhancement(
    first.sqlite,
    firstUser,
    buildId,
    "archon-shard-1",
    { kind: "shard", slug: "crimson-archon-shard" },
    undefined,
    "ability-strength",
  );
  const profile = exportPlayerProfile(first.sqlite, firstUser);
  assert.equal(profile.schemaVersion, 17);
  assert.equal(profile.nodeProgress[0]?.node.slug, "e-prime");
  const secondUser = createLocalUser(second.sqlite, { username: "Importer" });
  const result = importPlayerProfile(second.sqlite, secondUser, profile);

  assert.deepEqual(result, {
    inventoryImported: 1,
    goalsImported: 1,
    recipePreferencesImported: 1,
    discoveryProgressImported: 1,
    nodeProgressImported: 1,
    todosImported: 2,
    watchesImported: 1,
    buildsImported: 1,
    unresolved: [],
  });
  assert.deepEqual(getPlayerSettings(second.sqlite, secondUser), {
    masteryRank: 31,
    railjackIntrinsicRank: 7,
  });
  assert.deepEqual(listPlayerInventory(second.sqlite, secondUser), [
    {
      entityId: second.entityId,
      kind: "weapon",
      slug: "braton",
      name: "Braton",
      ownedCount: 2,
      builtCount: 1,
      wantedCount: 3,
      mastered: true,
      subsumed: undefined,
      note: "Keep one unranked.",
    },
  ]);
  assert.deepEqual(
    listPlayerGoals(second.sqlite, secondUser).map(
      ({ name, targetQuantity }) => ({ name, targetQuantity }),
    ),
    [{ name: "Braton", targetQuantity: 4 }],
  );
  assert.deepEqual(
    second.sqlite
      .prepare(
        "select source_id as sourceId, source_record_key as sourceRecordKey from player_recipe_preferences where user_id = ?",
      )
      .all(secondUser),
    [{ sourceId: "items", sourceRecordKey: "braton" }],
  );
  assert.equal(
    getDiscoveryProgress(second.sqlite, secondUser, {
      kind: "quest",
      slug: "awakening",
    }),
    "completed",
  );
  assert.equal(
    getNodeCompletion(second.sqlite, secondUser, "e-prime"),
    "completed",
  );
  assert.deepEqual(
    listPlayerTodos(second.sqlite, secondUser).map(
      ({ title, notes, status, dueAt, recurrence, entity }) => ({
        title,
        notes,
        status,
        dueAt,
        recurrence,
        entity,
      }),
    ),
    [
      {
        title: "Prepare",
        notes: "Before reset",
        status: "open",
        dueAt: Date.parse("2027-02-28T00:00:00.000Z"),
        recurrence,
        entity: { kind: "weapon", slug: "braton", name: "Braton" },
      },
      {
        title: "Prepare",
        notes: "Before reset",
        status: "completed",
        dueAt: todoDueAt,
        recurrence,
        entity: { kind: "weapon", slug: "braton", name: "Braton" },
      },
    ],
  );
  const restoredCompleted = listPlayerTodos(second.sqlite, secondUser).find(
    ({ status }) => status === "completed",
  )!;
  setPlayerTodoStatus(second.sqlite, secondUser, restoredCompleted.id, "open");
  setPlayerTodoStatus(
    second.sqlite,
    secondUser,
    restoredCompleted.id,
    "completed",
  );
  assert.equal(listPlayerTodos(second.sqlite, secondUser).length, 2);
  assert.deepEqual(
    listWorldStateWatches(second.sqlite, secondUser).map(
      ({ kind, trigger, leadMinutes, labelContains, enabled, entity }) => ({
        kind,
        trigger,
        leadMinutes,
        labelContains,
        enabled,
        entity,
      }),
    ),
    [
      {
        kind: "cycle",
        trigger: "ending",
        leadMinutes: 15,
        labelContains: "Cetus",
        enabled: true,
        entity: { kind: "weapon", slug: "braton", name: "Braton" },
      },
    ],
  );
  const importedBuild = listPlayerBuilds(second.sqlite, secondUser)[0]!;
  assert.equal(importedBuild.title, "Portable build");
  assert.deepEqual(importedBuild.equipment[0], {
    id: importedBuild.equipment[0]?.id,
    slot: "primary",
    entity: { kind: "weapon", slug: "braton", name: "Braton" },
    notes: "Main weapon",
    configuration: "A",
    rank: 24,
    formaCount: 2,
    capacityUpgrade: true,
    capacity: {},
    modSlots: [{ position: 0, role: "normal", polarity: "madurai" }],
    mods: [
      {
        position: 0,
        rank: 5,
        entity: { kind: "mod", slug: "serration", name: "Serration" },
      },
    ],
  });
  assert.deepEqual(importedBuild.enhancements, [
    {
      slot: "archon-shard-1",
      entity: {
        kind: "shard",
        slug: "crimson-archon-shard",
        name: "Crimson Archon Shard",
      },
      rank: undefined,
      option: {
        key: "ability-strength",
        label: "Ability Strength",
        available: true,
      },
    },
    {
      slot: "warframe-arcane-1",
      entity: {
        kind: "arcane",
        slug: "arcane-barrier",
        name: "Arcane Barrier",
      },
      rank: 5,
    },
  ]);
});

test("inventory writes can resolve an active canonical entity without accepting its ID", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-inventory-reference-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const catalog = createCatalog(path.join(root, "catalog.sqlite"));
  context.after(() => catalog.sqlite.close());
  const userId = createLocalUser(catalog.sqlite, { username: "Player" });

  setInventoryEntryByReference(
    catalog.sqlite,
    userId,
    { kind: "weapon", slug: "braton" },
    { ownedCount: 1, builtCount: 1, wantedCount: 0 },
  );
  assert.equal(
    findPlayerInventoryEntry(catalog.sqlite, userId, "weapon", "braton")
      ?.builtCount,
    1,
  );
  assert.throws(
    () =>
      setInventoryEntryByReference(
        catalog.sqlite,
        userId,
        { kind: "weapon", slug: "missing" },
        { ownedCount: 1, builtCount: 0, wantedCount: 0 },
      ),
    /Unknown active entity/,
  );
});

test("profile replacement is transactional and reports missing entities", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-profile-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const catalog = createCatalog(path.join(root, "catalog.sqlite"));
  context.after(() => catalog.sqlite.close());
  const userId = createLocalUser(catalog.sqlite, { username: "Player" });
  setInventoryEntry(catalog.sqlite, userId, catalog.entityId, {
    ownedCount: 1,
    builtCount: 0,
    wantedCount: 0,
  });
  const missingProfile = {
    schemaVersion: 17,
    exportedAt: "2026-10-13T12:00:00.000Z",
    player: {},
    inventory: [
      {
        entity: {
          externalIds: [
            { sourceId: "items", namespace: "id", value: "missing" },
          ],
          kind: "weapon",
          slug: "missing",
          name: "Missing",
        },
        ownedCount: 1,
        builtCount: 0,
        wantedCount: 0,
      },
    ],
    goals: [],
    recipePreferences: [],
    discoveryProgress: [],
    nodeProgress: [],
    todos: [],
    watches: [],
    builds: [],
  };

  const result = importPlayerProfile(catalog.sqlite, userId, missingProfile, {
    mode: "replace",
  });
  assert.deepEqual(result, {
    inventoryImported: 0,
    goalsImported: 0,
    recipePreferencesImported: 0,
    discoveryProgressImported: 0,
    nodeProgressImported: 0,
    todosImported: 0,
    watchesImported: 0,
    buildsImported: 0,
    unresolved: [
      { section: "inventory", index: 0, name: "Missing", reason: "missing" },
    ],
  });
  assert.deepEqual(listPlayerInventory(catalog.sqlite, userId), []);
  assert.throws(
    () =>
      importPlayerProfile(catalog.sqlite, userId, {
        ...missingProfile,
        inventory: [{ ...missingProfile.inventory[0], ownedCount: -1 }],
      }),
    /ownedCount/,
  );
  assert.deepEqual(listPlayerInventory(catalog.sqlite, userId), []);
  const missingBuildProfile = {
    ...missingProfile,
    inventory: [],
    builds: [
      {
        title: "Broken build",
        equipment: [
          {
            slot: "primary",
            entity: missingProfile.inventory[0]!.entity,
            formaCount: 0,
            capacityUpgrade: false,
            modSlots: [],
            mods: [],
          },
        ],
        enhancements: [],
      },
    ],
  };
  assert.deepEqual(
    importPlayerProfile(catalog.sqlite, userId, missingBuildProfile),
    {
      inventoryImported: 0,
      goalsImported: 0,
      recipePreferencesImported: 0,
      discoveryProgressImported: 0,
      nodeProgressImported: 0,
      todosImported: 0,
      watchesImported: 0,
      buildsImported: 0,
      unresolved: [
        {
          section: "builds",
          index: 0,
          name: "Broken build: Missing",
          reason: "missing",
        },
      ],
    },
  );
  assert.deepEqual(listPlayerBuilds(catalog.sqlite, userId), []);
  const missingTodoProfile = {
    ...missingProfile,
    inventory: [],
    todos: [
      {
        title: "Keep this task",
        status: "open",
        entity: missingProfile.inventory[0]!.entity,
      },
    ],
  };
  assert.deepEqual(
    importPlayerProfile(catalog.sqlite, userId, missingTodoProfile),
    {
      inventoryImported: 0,
      goalsImported: 0,
      recipePreferencesImported: 0,
      discoveryProgressImported: 0,
      nodeProgressImported: 0,
      todosImported: 1,
      watchesImported: 0,
      buildsImported: 0,
      unresolved: [
        { section: "todos", index: 0, name: "Missing", reason: "missing" },
      ],
    },
  );
  assert.deepEqual(
    listPlayerTodos(catalog.sqlite, userId).map(({ title, entity }) => ({
      title,
      entity,
    })),
    [{ title: "Keep this task", entity: undefined }],
  );
  const missingWatchProfile = {
    ...missingProfile,
    inventory: [],
    watches: [
      {
        kind: "event",
        trigger: "active",
        leadMinutes: 0,
        enabled: true,
        labelContains: "Missing",
        entity: missingProfile.inventory[0]!.entity,
      },
    ],
  };
  assert.deepEqual(
    importPlayerProfile(catalog.sqlite, userId, missingWatchProfile),
    {
      inventoryImported: 0,
      goalsImported: 0,
      recipePreferencesImported: 0,
      discoveryProgressImported: 0,
      nodeProgressImported: 0,
      todosImported: 0,
      watchesImported: 1,
      buildsImported: 0,
      unresolved: [
        { section: "watches", index: 0, name: "Missing", reason: "missing" },
      ],
    },
  );
  assert.deepEqual(
    listWorldStateWatches(catalog.sqlite, userId).map(
      ({ kind, labelContains, entity }) => ({ kind, labelContains, entity }),
    ),
    [{ kind: "event", labelContains: "Missing", entity: undefined }],
  );
  const invalidRecurrenceProfile = {
    ...missingProfile,
    inventory: [],
    todos: [
      {
        title: "January",
        status: "completed",
        dueAt: Date.parse("2027-01-31T00:00:00.000Z"),
        recurrence: { kind: "monthly-date", day: 31 },
      },
      {
        title: "March is not next",
        status: "open",
        dueAt: Date.parse("2027-03-31T00:00:00.000Z"),
        recurrence: { kind: "monthly-date", day: 31 },
        recurrenceFrom: 0,
      },
    ],
  };
  assert.throws(
    () => importPlayerProfile(catalog.sqlite, userId, invalidRecurrenceProfile),
    /invalid recurrenceFrom/,
  );
  assert.throws(
    () =>
      importPlayerProfile(catalog.sqlite, userId, {
        ...missingProfile,
        schemaVersion: 10,
      }),
    /schemaVersion 17/,
  );
  assert.throws(
    () =>
      importPlayerProfile(catalog.sqlite, userId, {
        ...missingBuildProfile,
        builds: [
          {
            ...missingBuildProfile.builds[0],
            equipment: [
              { ...missingBuildProfile.builds[0]!.equipment[0], rank: 41 },
            ],
          },
        ],
      }),
    /equipment 0 is invalid/,
  );
  assert.throws(
    () =>
      importPlayerProfile(catalog.sqlite, userId, {
        ...missingBuildProfile,
        builds: [
          {
            ...missingBuildProfile.builds[0],
            equipment: [
              {
                ...missingBuildProfile.builds[0]!.equipment[0],
                modSlots: [{ position: 0, role: "unknown" }],
              },
            ],
          },
        ],
      }),
    /mod slot 0 is invalid/,
  );
});

function createCatalog(databasePath: string): {
  sqlite: Database.Database;
  entityId: string;
} {
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  const evidence = {
    sourceId: "items",
    sourceRecordKey: "braton",
    snapshotVersion: "v1",
    retrievedAt: "2026-10-13T12:00:00.000Z",
  };
  const observations: Observation[] = [
    {
      type: "entity",
      kind: "weapon",
      externalIds: [{ sourceId: "items", namespace: "id", value: "braton" }],
      fields: { name: "Braton", slug: "braton", weaponClass: "primary" },
      evidence,
    },
    {
      type: "entity",
      kind: "quest",
      externalIds: [{ sourceId: "items", namespace: "id", value: "awakening" }],
      fields: { name: "Awakening", slug: "awakening" },
      evidence: { ...evidence, sourceRecordKey: "awakening" },
    },
    {
      type: "entity",
      kind: "node",
      externalIds: [{ sourceId: "items", namespace: "id", value: "e-prime" }],
      fields: { name: "E Prime", slug: "e-prime" },
      evidence: { ...evidence, sourceRecordKey: "e-prime" },
    },
    {
      type: "entity",
      kind: "mod",
      externalIds: [{ sourceId: "items", namespace: "id", value: "serration" }],
      fields: { name: "Serration", slug: "serration" },
      evidence: { ...evidence, sourceRecordKey: "serration" },
    },
    {
      type: "entity",
      kind: "arcane",
      externalIds: [
        { sourceId: "items", namespace: "id", value: "arcane-barrier" },
      ],
      fields: {
        name: "Arcane Barrier",
        slug: "arcane-barrier",
        arcaneClass: "warframe",
      },
      evidence: { ...evidence, sourceRecordKey: "arcane-barrier" },
    },
    {
      type: "entity",
      kind: "shard",
      externalIds: [
        { sourceId: "items", namespace: "id", value: "crimson-shard" },
      ],
      fields: { name: "Crimson Archon Shard", slug: "crimson-archon-shard" },
      evidence: { ...evidence, sourceRecordKey: "crimson-shard" },
    },
    {
      type: "enhancement-option",
      subjectExternalId: {
        sourceId: "items",
        namespace: "id",
        value: "crimson-shard",
      },
      key: "ability-strength",
      label: "Ability Strength",
      evidence: {
        ...evidence,
        sourceRecordKey: "crimson-shard:ability-strength",
      },
    },
    {
      type: "entity",
      kind: "resource",
      externalIds: [{ sourceId: "items", namespace: "id", value: "alloy" }],
      fields: { name: "Alloy Plate", slug: "alloy-plate" },
      evidence: { ...evidence, sourceRecordKey: "alloy" },
    },
    {
      type: "recipe",
      outputExternalId: { sourceId: "items", namespace: "id", value: "braton" },
      ingredients: [
        {
          externalId: { sourceId: "items", namespace: "id", value: "alloy" },
          quantity: 10,
        },
      ],
      evidence,
    },
  ];
  promoteSource(sqlite, {
    source: {
      id: "items",
      name: "Items",
      homepage: "https://example.test",
      priority: 10,
    },
    version: "v1",
    contentHash: "hash",
    retrievedAt: evidence.retrievedAt,
    observations,
  });
  const entityId = (
    sqlite.prepare("select id from entities where slug = 'braton'").get() as {
      id: string;
    }
  ).id;
  return { sqlite, entityId };
}
