import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type Database from "better-sqlite3";
import type { Observation } from "@ordis-prime/domain";
import { createLocalUser, exportPlayerProfile, findPlayerInventoryEntry, importPlayerProfile, listPlayerGoals, listPlayerInventory, migrateDatabase, openSqliteDatabase, promoteSource, setInventoryEntry, setInventoryEntryByReference, setPlayerGoal } from "../src/index.ts";

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
  const profile = exportPlayerProfile(first.sqlite, firstUser);
  const secondUser = createLocalUser(second.sqlite, { username: "Importer" });
  const result = importPlayerProfile(second.sqlite, secondUser, profile);

  assert.deepEqual(result, { inventoryImported: 1, goalsImported: 1, unresolved: [] });
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
    schemaVersion: 2,
    exportedAt: "2026-10-13T12:00:00.000Z",
    inventory: [{ entity: { externalIds: [{ sourceId: "items", namespace: "id", value: "missing" }], kind: "weapon", slug: "missing", name: "Missing" }, ownedCount: 1, builtCount: 0, wantedCount: 0 }],
    goals: [],
  };

  const result = importPlayerProfile(catalog.sqlite, userId, missingProfile, { mode: "replace" });
  assert.deepEqual(result, { inventoryImported: 0, goalsImported: 0, unresolved: [{ section: "inventory", index: 0, name: "Missing", reason: "missing" }] });
  assert.deepEqual(listPlayerInventory(catalog.sqlite, userId), []);
  assert.throws(() => importPlayerProfile(catalog.sqlite, userId, { ...missingProfile, inventory: [{ ...missingProfile.inventory[0], ownedCount: -1 }] }), /ownedCount/);
  assert.deepEqual(listPlayerInventory(catalog.sqlite, userId), []);
});

function createCatalog(databasePath: string): { sqlite: Database.Database; entityId: string } {
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  const evidence = { sourceId: "items", sourceRecordKey: "braton", snapshotVersion: "v1", retrievedAt: "2026-10-13T12:00:00.000Z" };
  const observation: Observation = { type: "entity", kind: "weapon", externalIds: [{ sourceId: "items", namespace: "id", value: "braton" }], fields: { name: "Braton", slug: "braton" }, evidence };
  promoteSource(sqlite, { source: { id: "items", name: "Items", homepage: "https://example.test", priority: 10 }, version: "v1", contentHash: "hash", retrievedAt: evidence.retrievedAt, observations: [observation] });
  const entityId = (sqlite.prepare("select id from entities where slug = 'braton'").get() as { id: string }).id;
  return { sqlite, entityId };
}
