import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Observation } from "@ordis-prime/domain";
import { buildAcquisitionPlan, createLocalUser, migrateDatabase, openSqliteDatabase, promoteSource, setInventoryEntryByReference, setPlayerGoal } from "../src/index.ts";

test("persisted goals expand through active recipes and produce named node reasons", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-planner-db-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "planner.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  const evidence = { sourceId: "items", sourceRecordKey: "frame", snapshotVersion: "v1", retrievedAt: "2026-10-13T12:00:00.000Z" };
  const external = (value: string) => ({ sourceId: "items", namespace: "id", value });
  const observations: Observation[] = [
    { type: "entity", kind: "warframe", externalIds: [external("frame")], fields: { name: "Test Frame", slug: "test-frame" }, evidence },
    { type: "entity", kind: "component", externalIds: [external("chassis")], fields: { name: "Test Chassis", slug: "test-chassis" }, evidence: { ...evidence, sourceRecordKey: "chassis" } },
    { type: "entity", kind: "node", externalIds: [external("node")], fields: { name: "Test Node", slug: "test-node" }, evidence: { ...evidence, sourceRecordKey: "node" } },
    { type: "recipe", outputExternalId: external("frame"), outputQuantity: 1, ingredients: [{ externalId: external("chassis"), quantity: 3 }], evidence },
    { type: "drop", rewardExternalId: external("chassis"), nodeExternalId: external("node"), locationLabel: "Test Node", chance: 0.25, rotation: "C", evidence },
  ];
  promoteSource(sqlite, { source: { id: "items", name: "Items", homepage: "https://example.test", priority: 10 }, version: "v1", contentHash: "hash", retrievedAt: evidence.retrievedAt, observations });
  const userId = createLocalUser(sqlite, { username: "Planner" });
  setInventoryEntryByReference(sqlite, userId, { kind: "warframe", slug: "test-frame" }, { ownedCount: 1, builtCount: 0, wantedCount: 0 });
  setPlayerGoal(sqlite, userId, { kind: "warframe", slug: "test-frame" }, 2);

  const plan = buildAcquisitionPlan(sqlite, userId);
  assert.deepEqual(plan.goals.map(({ name, targetQuantity }) => ({ name, targetQuantity })), [{ name: "Test Frame", targetQuantity: 2 }]);
  assert.deepEqual(plan.missing.map(({ name, quantity }) => ({ name, quantity })), [{ name: "Test Chassis", quantity: 3 }]);
  assert.equal(plan.recommendations[0]?.nodeSlug, "test-node");
  assert.deepEqual(plan.recommendations[0]?.reasons, ["Drops 1 missing goal item", "Test Chassis: need 3, 25.00% documented chance, rotation C"]);

  setPlayerGoal(sqlite, userId, { kind: "warframe", slug: "test-frame" }, 0);
  assert.deepEqual(buildAcquisitionPlan(sqlite, userId).goals, []);
});
