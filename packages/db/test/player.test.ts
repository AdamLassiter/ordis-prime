import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type Database from "better-sqlite3";
import type { Observation } from "@ordis-prime/domain";
import { configureBuildEquipment, createLocalUser, createPlayerBuild, createPlayerTodo, createWorldStateWatch, exportPlayerProfile, findPlayerInventoryEntry, getDiscoveryProgress, importPlayerProfile, listPlayerBuilds, listPlayerGoals, listPlayerInventory, listPlayerTodos, listWorldStateWatches, migrateDatabase, openSqliteDatabase, promoteSource, setBuildEnhancement, setBuildEquipment, setBuildMod, setDiscoveryProgress, setInventoryEntry, setInventoryEntryByReference, setPlayerGoal, setPlayerTodoStatus } from "../src/index.ts";

test("profiles resolve stable source IDs across installations with different canonical UUIDs", async (context) => {
  const roots = await Promise.all(["a", "b"].map((name) => fs.mkdtemp(path.join(os.tmpdir(), `ordis-profile-${name}-`))));
  context.after(() => Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true }))));
  const first = createCatalog(path.join(roots[0]!, "catalog.sqlite"));
  const second = createCatalog(path.join(roots[1]!, "catalog.sqlite"));
  context.after(() => { first.sqlite.close(); second.sqlite.close(); });
  assert.notEqual(first.entityId, second.entityId);

  const firstUser = createLocalUser(first.sqlite, { username: "Exporter" });
  assert.deepEqual(findPlayerInventoryEntry(first.sqlite, firstUser, "weapon", "braton"), {
    entityId: first.entityId, kind: "weapon", slug: "braton", name: "Braton",
    ownedCount: 0, builtCount: 0, wantedCount: 0, mastered: undefined, subsumed: undefined, note: undefined,
  });
  setInventoryEntry(first.sqlite, firstUser, first.entityId, { ownedCount: 2, builtCount: 1, wantedCount: 3, mastered: true, note: "Keep one unranked." });
  setPlayerGoal(first.sqlite, firstUser, { kind: "weapon", slug: "braton" }, 4);
  setDiscoveryProgress(first.sqlite, firstUser, { kind: "quest", slug: "awakening" }, "completed");
  const todoId = createPlayerTodo(first.sqlite, firstUser, { title: "Prepare", notes: "Before reset", dueAt: 1_800_000_000_000, recurrenceDays: 30, entity: { kind: "weapon", slug: "braton" } });
  setPlayerTodoStatus(first.sqlite, firstUser, todoId, "completed");
  createWorldStateWatch(first.sqlite, firstUser, { kind: "cycle", trigger: "ending", leadMinutes: 15, labelContains: "Cetus" });
  const buildId = createPlayerBuild(first.sqlite, firstUser, { title: "Portable build", category: "test", notes: "Moves across catalogs" });
  setBuildEquipment(first.sqlite, firstUser, buildId, "primary", { kind: "weapon", slug: "braton" }, "Main weapon");
  configureBuildEquipment(first.sqlite, firstUser, buildId, "primary", { configuration: "A", formaCount: 2, capacityUpgrade: true });
  setBuildMod(first.sqlite, firstUser, buildId, "primary", 0, { kind: "mod", slug: "serration" }, 5);
  setBuildEnhancement(first.sqlite, firstUser, buildId, "warframe-arcane-1", { kind: "arcane", slug: "arcane-barrier" }, 5);
  setBuildEnhancement(first.sqlite, firstUser, buildId, "archon-shard-1", { kind: "shard", slug: "crimson-archon-shard" });
  const profile = exportPlayerProfile(first.sqlite, firstUser);
  const secondUser = createLocalUser(second.sqlite, { username: "Importer" });
  const result = importPlayerProfile(second.sqlite, secondUser, profile);

  assert.deepEqual(result, { inventoryImported: 1, goalsImported: 1, discoveryProgressImported: 1, todosImported: 2, watchesImported: 1, buildsImported: 1, unresolved: [] });
  assert.deepEqual(listPlayerInventory(second.sqlite, secondUser), [{
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
  }]);
  assert.deepEqual(listPlayerGoals(second.sqlite, secondUser).map(({ name, targetQuantity }) => ({ name, targetQuantity })), [{ name: "Braton", targetQuantity: 4 }]);
  assert.equal(getDiscoveryProgress(second.sqlite, secondUser, { kind: "quest", slug: "awakening" }), "completed");
  assert.deepEqual(listPlayerTodos(second.sqlite, secondUser).map(({ title, notes, status, dueAt, recurrenceDays, entity }) => ({ title, notes, status, dueAt, recurrenceDays, entity })), [
    { title: "Prepare", notes: "Before reset", status: "open", dueAt: 1_800_000_000_000 + 30 * 86_400_000, recurrenceDays: 30, entity: { kind: "weapon", slug: "braton", name: "Braton" } },
    { title: "Prepare", notes: "Before reset", status: "completed", dueAt: 1_800_000_000_000, recurrenceDays: 30, entity: { kind: "weapon", slug: "braton", name: "Braton" } },
  ]);
  const restoredCompleted = listPlayerTodos(second.sqlite, secondUser).find(({ status }) => status === "completed")!;
  setPlayerTodoStatus(second.sqlite, secondUser, restoredCompleted.id, "open");
  setPlayerTodoStatus(second.sqlite, secondUser, restoredCompleted.id, "completed");
  assert.equal(listPlayerTodos(second.sqlite, secondUser).length, 2);
  assert.deepEqual(listWorldStateWatches(second.sqlite, secondUser).map(({ kind, trigger, leadMinutes, labelContains, enabled }) => ({ kind, trigger, leadMinutes, labelContains, enabled })), [{ kind: "cycle", trigger: "ending", leadMinutes: 15, labelContains: "Cetus", enabled: true }]);
  const importedBuild = listPlayerBuilds(second.sqlite, secondUser)[0]!;
  assert.equal(importedBuild.title, "Portable build");
  assert.deepEqual(importedBuild.equipment[0], { id: importedBuild.equipment[0]?.id, slot: "primary", entity: { kind: "weapon", slug: "braton", name: "Braton" }, notes: "Main weapon", configuration: "A", formaCount: 2, capacityUpgrade: true, mods: [{ position: 0, rank: 5, entity: { kind: "mod", slug: "serration", name: "Serration" } }] });
  assert.deepEqual(importedBuild.enhancements, [
    { slot: "archon-shard-1", entity: { kind: "shard", slug: "crimson-archon-shard", name: "Crimson Archon Shard" }, rank: undefined },
    { slot: "warframe-arcane-1", entity: { kind: "arcane", slug: "arcane-barrier", name: "Arcane Barrier" }, rank: 5 },
  ]);
});

test("inventory writes can resolve an active canonical entity without accepting its ID", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-inventory-reference-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const catalog = createCatalog(path.join(root, "catalog.sqlite"));
  context.after(() => catalog.sqlite.close());
  const userId = createLocalUser(catalog.sqlite, { username: "Player" });

  setInventoryEntryByReference(catalog.sqlite, userId, { kind: "weapon", slug: "braton" }, { ownedCount: 1, builtCount: 1, wantedCount: 0 });
  assert.equal(findPlayerInventoryEntry(catalog.sqlite, userId, "weapon", "braton")?.builtCount, 1);
  assert.throws(() => setInventoryEntryByReference(catalog.sqlite, userId, { kind: "weapon", slug: "missing" }, { ownedCount: 1, builtCount: 0, wantedCount: 0 }), /Unknown active entity/);
});

test("profile replacement is transactional and reports missing entities", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-profile-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const catalog = createCatalog(path.join(root, "catalog.sqlite"));
  context.after(() => catalog.sqlite.close());
  const userId = createLocalUser(catalog.sqlite, { username: "Player" });
  setInventoryEntry(catalog.sqlite, userId, catalog.entityId, { ownedCount: 1, builtCount: 0, wantedCount: 0 });
  const missingProfile = {
    schemaVersion: 7,
    exportedAt: "2026-10-13T12:00:00.000Z",
    inventory: [{ entity: { externalIds: [{ sourceId: "items", namespace: "id", value: "missing" }], kind: "weapon", slug: "missing", name: "Missing" }, ownedCount: 1, builtCount: 0, wantedCount: 0 }],
    goals: [],
    discoveryProgress: [],
    todos: [],
    watches: [],
    builds: [],
  };

  const result = importPlayerProfile(catalog.sqlite, userId, missingProfile, { mode: "replace" });
  assert.deepEqual(result, { inventoryImported: 0, goalsImported: 0, discoveryProgressImported: 0, todosImported: 0, watchesImported: 0, buildsImported: 0, unresolved: [{ section: "inventory", index: 0, name: "Missing", reason: "missing" }] });
  assert.deepEqual(listPlayerInventory(catalog.sqlite, userId), []);
  assert.throws(() => importPlayerProfile(catalog.sqlite, userId, { ...missingProfile, inventory: [{ ...missingProfile.inventory[0], ownedCount: -1 }] }), /ownedCount/);
  assert.deepEqual(listPlayerInventory(catalog.sqlite, userId), []);
  const missingBuildProfile = { ...missingProfile, inventory: [], builds: [{ title: "Broken build", equipment: [{ slot: "primary", entity: missingProfile.inventory[0]!.entity, formaCount: 0, capacityUpgrade: false, mods: [] }], enhancements: [] }] };
  assert.deepEqual(importPlayerProfile(catalog.sqlite, userId, missingBuildProfile), {
    inventoryImported: 0, goalsImported: 0, discoveryProgressImported: 0, todosImported: 0, watchesImported: 0, buildsImported: 0,
    unresolved: [{ section: "builds", index: 0, name: "Broken build: Missing", reason: "missing" }],
  });
  assert.deepEqual(listPlayerBuilds(catalog.sqlite, userId), []);
  const missingTodoProfile = { ...missingProfile, inventory: [], todos: [{ title: "Keep this task", status: "open", entity: missingProfile.inventory[0]!.entity }] };
  assert.deepEqual(importPlayerProfile(catalog.sqlite, userId, missingTodoProfile), {
    inventoryImported: 0, goalsImported: 0, discoveryProgressImported: 0, todosImported: 1, watchesImported: 0, buildsImported: 0,
    unresolved: [{ section: "todos", index: 0, name: "Missing", reason: "missing" }],
  });
  assert.deepEqual(listPlayerTodos(catalog.sqlite, userId).map(({ title, entity }) => ({ title, entity })), [{ title: "Keep this task", entity: undefined }]);
  assert.throws(() => importPlayerProfile(catalog.sqlite, userId, { ...missingProfile, schemaVersion: 6 }), /schemaVersion 7/);
});

function createCatalog(databasePath: string): { sqlite: Database.Database; entityId: string } {
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  const evidence = { sourceId: "items", sourceRecordKey: "braton", snapshotVersion: "v1", retrievedAt: "2026-10-13T12:00:00.000Z" };
  const observations: Observation[] = [
    { type: "entity", kind: "weapon", externalIds: [{ sourceId: "items", namespace: "id", value: "braton" }], fields: { name: "Braton", slug: "braton" }, evidence },
    { type: "entity", kind: "quest", externalIds: [{ sourceId: "items", namespace: "id", value: "awakening" }], fields: { name: "Awakening", slug: "awakening" }, evidence: { ...evidence, sourceRecordKey: "awakening" } },
    { type: "entity", kind: "mod", externalIds: [{ sourceId: "items", namespace: "id", value: "serration" }], fields: { name: "Serration", slug: "serration" }, evidence: { ...evidence, sourceRecordKey: "serration" } },
    { type: "entity", kind: "arcane", externalIds: [{ sourceId: "items", namespace: "id", value: "arcane-barrier" }], fields: { name: "Arcane Barrier", slug: "arcane-barrier" }, evidence: { ...evidence, sourceRecordKey: "arcane-barrier" } },
    { type: "entity", kind: "shard", externalIds: [{ sourceId: "items", namespace: "id", value: "crimson-shard" }], fields: { name: "Crimson Archon Shard", slug: "crimson-archon-shard" }, evidence: { ...evidence, sourceRecordKey: "crimson-shard" } },
  ];
  promoteSource(sqlite, { source: { id: "items", name: "Items", homepage: "https://example.test", priority: 10 }, version: "v1", contentHash: "hash", retrievedAt: evidence.retrievedAt, observations });
  const entityId = (sqlite.prepare("select id from entities where slug = 'braton'").get() as { id: string }).id;
  return { sqlite, entityId };
}
