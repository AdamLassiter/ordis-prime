import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Observation } from "@ordis-prime/domain";
import { buildAcquisitionPlan, createLocalUser, findLiveAcquisitionOpportunities, migrateDatabase, openSqliteDatabase, promoteSource, promoteWorldState, setDiscoveryProgress, setInventoryEntryByReference, setPlayerGoal, setPlayerRecipePreference } from "../src/index.ts";

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
    { type: "entity", kind: "quest", externalIds: [external("quest")], fields: { name: "Test Quest", slug: "test-quest" }, evidence: { ...evidence, sourceRecordKey: "quest" } },
    { type: "entity", kind: "mechanic", externalIds: [external("mechanic")], fields: { name: "Test Mechanic", slug: "test-mechanic" }, evidence: { ...evidence, sourceRecordKey: "mechanic" } },
    { type: "recipe", outputExternalId: external("frame"), outputQuantity: 1, ingredients: [{ externalId: external("chassis"), quantity: 3 }], evidence },
    { type: "drop", rewardExternalId: external("chassis"), nodeExternalId: external("node"), locationLabel: "Test Node", chance: 0.25, rotation: "C", evidence },
    { type: "entity-relation", fromExternalId: external("node"), toExternalId: external("quest"), kind: "requires", evidence: { ...evidence, sourceRecordKey: "node:quest" } },
    { type: "entity-relation", fromExternalId: external("mechanic"), toExternalId: external("node"), kind: "unlocks", evidence: { ...evidence, sourceRecordKey: "mechanic:node" } },
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
  assert.equal(plan.recommendations[0]?.accessStatus, "blocked");
  assert.deepEqual(plan.recommendations[0]?.accessRequirements.map(({ name, state, relationKinds, sources }) => ({ name, state, relationKinds, sources: sources.map(({ name: sourceName }) => sourceName) })), [
    { name: "Test Mechanic", state: "unseen", relationKinds: ["unlocks"], sources: ["Items"] },
    { name: "Test Quest", state: "unseen", relationKinds: ["requires"], sources: ["Items"] },
  ]);
  setDiscoveryProgress(sqlite, userId, { kind: "mechanic", slug: "test-mechanic" }, "completed");
  setDiscoveryProgress(sqlite, userId, { kind: "quest", slug: "test-quest" }, "discovered");
  assert.equal(buildAcquisitionPlan(sqlite, userId).recommendations[0]?.accessStatus, "blocked");
  setDiscoveryProgress(sqlite, userId, { kind: "quest", slug: "test-quest" }, "completed");
  assert.equal(buildAcquisitionPlan(sqlite, userId).recommendations[0]?.accessStatus, "available");
  promoteWorldState(sqlite, {
    source: { id: "world", name: "World", homepage: "https://example.test/world", priority: 1 }, version: "live-v1", contentHash: "live-hash", observedAt: "2026-10-13T12:00:00.000Z", snapshotPath: "/live",
    windows: [{ externalId: "fissure:test", kind: "fissure", label: "Lith Fissure", nodeLabel: "Test Node", activation: "2026-10-13T11:00:00.000Z", expiry: "2026-10-13T13:00:00.000Z", evidence: { sourceId: "world", sourceRecordKey: "test", snapshotVersion: "live-v1", retrievedAt: "2026-10-13T12:00:00.000Z" } }],
  });
  assert.deepEqual(findLiveAcquisitionOpportunities(sqlite, plan, Date.parse("2026-10-13T12:00:00.000Z")).map(({ label, nodeSlug, status, neededRewards }) => ({ label, nodeSlug, status, neededRewards: neededRewards.map(({ name, quantity }) => ({ name, quantity })) })), [{ label: "Lith Fissure", nodeSlug: "test-node", status: "active", neededRewards: [{ name: "Test Chassis", quantity: 3 }] }]);

  setPlayerGoal(sqlite, userId, { kind: "warframe", slug: "test-frame" }, 0);
  assert.deepEqual(buildAcquisitionPlan(sqlite, userId).goals, []);
});

test("players can choose stable alternatives when active sources disagree on a recipe", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-planner-alternatives-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "planner.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  const external = (value: string) => ({ sourceId: "base", namespace: "id", value });
  const evidence = { sourceId: "base", sourceRecordKey: "base-recipe", snapshotVersion: "v1", retrievedAt: "2026-10-13T12:00:00.000Z" };
  const entities: Observation[] = [
    { type: "entity", kind: "weapon", externalIds: [external("weapon")], fields: { name: "Choice Weapon", slug: "choice-weapon" }, evidence: { ...evidence, sourceRecordKey: "weapon" } },
    { type: "entity", kind: "resource", externalIds: [external("alloy")], fields: { name: "Alloy", slug: "alloy" }, evidence: { ...evidence, sourceRecordKey: "alloy" } },
    { type: "entity", kind: "resource", externalIds: [external("cells")], fields: { name: "Cells", slug: "cells" }, evidence: { ...evidence, sourceRecordKey: "cells" } },
    { type: "recipe", outputExternalId: external("weapon"), ingredients: [{ externalId: external("alloy"), quantity: 10 }], evidence },
  ];
  promoteSource(sqlite, { source: { id: "base", name: "Base recipes", homepage: "https://example.test/base", priority: 10 }, version: "v1", contentHash: "base-v1", retrievedAt: evidence.retrievedAt, observations: entities });
  const alternateEvidence = { ...evidence, sourceId: "alternate", sourceRecordKey: "alternate-recipe", snapshotVersion: "alt-v1" };
  promoteSource(sqlite, { source: { id: "alternate", name: "Alternate recipes", homepage: "https://example.test/alternate", priority: 20 }, version: "alt-v1", contentHash: "alt-v1", retrievedAt: evidence.retrievedAt, observations: [{ type: "recipe", outputExternalId: external("weapon"), ingredients: [{ externalId: external("cells"), quantity: 2 }], evidence: alternateEvidence }] });
  const userId = createLocalUser(sqlite, { username: "Chooser" });
  setPlayerGoal(sqlite, userId, { kind: "weapon", slug: "choice-weapon" }, 1);

  let plan = buildAcquisitionPlan(sqlite, userId);
  assert.deepEqual(plan.missing.map(({ name, quantity }) => ({ name, quantity })), [{ name: "Cells", quantity: 2 }]);
  assert.equal(plan.recipeChoices[0]?.options.find(({ selected }) => selected)?.sourceId, "alternate");
  const baseOption = plan.recipeChoices[0]!.options.find(({ sourceId }) => sourceId === "base")!;
  setPlayerRecipePreference(sqlite, userId, { kind: "weapon", slug: "choice-weapon" }, baseOption.recipeId);
  plan = buildAcquisitionPlan(sqlite, userId);
  assert.deepEqual(plan.missing.map(({ name, quantity }) => ({ name, quantity })), [{ name: "Alloy", quantity: 10 }]);
  assert.equal(plan.recipeChoices[0]?.options.find(({ selected }) => selected)?.sourceId, "base");

  const refreshed = entities.map((observation) => ({ ...observation, evidence: { ...observation.evidence, snapshotVersion: "v2" } })) as Observation[];
  promoteSource(sqlite, { source: { id: "base", name: "Base recipes", homepage: "https://example.test/base", priority: 10 }, version: "v2", contentHash: "base-v2", retrievedAt: evidence.retrievedAt, observations: refreshed });
  plan = buildAcquisitionPlan(sqlite, userId);
  assert.equal(plan.recipeChoices[0]?.options.find(({ selected }) => selected)?.sourceId, "base");
});
