import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addBuildAcquisitionGoals, clonePlayerBuild, cloneSharedBuild, configureBuildEquipment, createBuildShare, createLocalUser, createPlayerBuild, findSharedBuild, getPlayerBuild, listBuildShares, listPlayerGoals, migrateDatabase, openSqliteDatabase, revokeBuildShare, searchBuildCandidates, searchBuildEnhancementCandidates, setBuildEnhancement, setBuildEquipment, setBuildMod, setInventoryEntry, setPlayerGoal, updatePlayerBuild } from "../src/index.ts";

test("build drafts are private and share snapshots remain immutable", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-builds-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "builds.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const owner = createLocalUser(database, { username: "Builder" });
  const other = createLocalUser(database, { username: "Other" });
  seedEntity(database, "frame", "warframe", "Mag", "mag");
  seedEntity(database, "weapon", "weapon", "Paris", "paris");
  seedEntity(database, "mod", "mod", "Serration", "serration");
  seedEntity(database, "arcane", "arcane", "Arcane Barrier", "arcane-barrier");
  seedEntity(database, "shard", "shard", "Crimson Archon Shard", "crimson-archon-shard");
  seedEnhancementOption(database, "shard", "ability-strength", "Ability Strength");
  assert.deepEqual(searchBuildCandidates(database, "primary", "Par"), [{ kind: "weapon", slug: "paris", name: "Paris" }]);
  assert.deepEqual(searchBuildCandidates(database, "mod", "Serr"), [{ kind: "mod", slug: "serration", name: "Serration" }]);
  assert.deepEqual(searchBuildEnhancementCandidates(database, "warframe-arcane-1", "Barrier"), [{ kind: "arcane", slug: "arcane-barrier", name: "Arcane Barrier" }]);
  assert.deepEqual(searchBuildEnhancementCandidates(database, "archon-shard-1", "Crimson"), [{ kind: "shard", slug: "crimson-archon-shard", name: "Crimson Archon Shard", enhancementOptions: [{ key: "ability-strength", label: "Ability Strength", sourceName: "Shard facts", citationUrl: "https://example.test/shards" }] }]);
  const buildId = createPlayerBuild(database, owner, { title: "Starter setup", category: "beginner" });
  setBuildEquipment(database, owner, buildId, "warframe", { kind: "warframe", slug: "mag" });
  setBuildEquipment(database, owner, buildId, "primary", { kind: "weapon", slug: "paris" });
  configureBuildEquipment(database, owner, buildId, "primary", { configuration: "Incarnon", formaCount: 3, capacityUpgrade: true });
  setBuildMod(database, owner, buildId, "primary", 0, { kind: "mod", slug: "serration" }, 5);
  setBuildEnhancement(database, owner, buildId, "warframe-arcane-1", { kind: "arcane", slug: "arcane-barrier" }, 5);
  setBuildEnhancement(database, owner, buildId, "archon-shard-1", { kind: "shard", slug: "crimson-archon-shard" }, undefined, "ability-strength");
  setBuildEnhancement(database, owner, buildId, "archon-shard-2", { kind: "shard", slug: "crimson-archon-shard" }, undefined, "ability-strength");
  assert.equal(getPlayerBuild(database, other, buildId), undefined);
  assert.equal(getPlayerBuild(database, owner, buildId)?.equipment.find(({ slot }) => slot === "primary")?.mods[0]?.entity.name, "Serration");
  assert.deepEqual(getPlayerBuild(database, owner, buildId)?.equipment.find(({ slot }) => slot === "primary"), {
    id: getPlayerBuild(database, owner, buildId)?.equipment.find(({ slot }) => slot === "primary")?.id,
    slot: "primary", entity: { kind: "weapon", slug: "paris", name: "Paris" }, configuration: "Incarnon", formaCount: 3, capacityUpgrade: true,
    notes: undefined, mods: [{ position: 0, rank: 5, entity: { kind: "mod", slug: "serration", name: "Serration" } }],
  });
  setPlayerGoal(database, owner, { kind: "mod", slug: "serration" }, 3);
  assert.equal(addBuildAcquisitionGoals(database, owner, buildId), 4);
  assert.deepEqual(listPlayerGoals(database, owner).map(({ name, targetQuantity }) => ({ name, targetQuantity })), [{ name: "Arcane Barrier", targetQuantity: 1 }, { name: "Crimson Archon Shard", targetQuantity: 2 }, { name: "Mag", targetQuantity: 1 }, { name: "Paris", targetQuantity: 1 }, { name: "Serration", targetQuantity: 3 }]);
  setInventoryEntry(database, owner, "weapon", { ownedCount: 0, builtCount: 1, wantedCount: 0 });
  assert.equal(addBuildAcquisitionGoals(database, owner, buildId), 0);

  const shareKey = createBuildShare(database, owner, buildId);
  const shared = findSharedBuild(database, shareKey)!;
  updatePlayerBuild(database, owner, buildId, { title: "Changed setup" });
  assert.equal(shared.title, "Starter setup");
  assert.equal(shared.equipment.find(({ slot }) => slot === "primary")?.configuration, "Incarnon");
  assert.deepEqual(shared.enhancements, [
    { slot: "archon-shard-1", entity: { kind: "shard", slug: "crimson-archon-shard", name: "Crimson Archon Shard" }, option: { key: "ability-strength", label: "Ability Strength", available: true } },
    { slot: "archon-shard-2", entity: { kind: "shard", slug: "crimson-archon-shard", name: "Crimson Archon Shard" }, option: { key: "ability-strength", label: "Ability Strength", available: true } },
    { slot: "warframe-arcane-1", entity: { kind: "arcane", slug: "arcane-barrier", name: "Arcane Barrier" }, rank: 5 },
  ]);
  assert.deepEqual(listBuildShares(database, owner, buildId).map(({ shareKey: _shareKey, ...entry }) => entry), [{ revision: shared.revision, createdAt: shared.sharedAt }]);
  const publicCloneId = cloneSharedBuild(database, other, shareKey);
  const publicClone = getPlayerBuild(database, other, publicCloneId)!;
  assert.equal(publicClone.title, "Starter setup (copy)");
  assert.equal(publicClone.equipment.find(({ slot }) => slot === "primary")?.configuration, "Incarnon");
  assert.equal(publicClone.equipment.find(({ slot }) => slot === "primary")?.mods[0]?.rank, 5);
  assert.equal(publicClone.enhancements.find(({ slot }) => slot === "warframe-arcane-1")?.rank, 5);
  assert.equal(getPlayerBuild(database, owner, publicCloneId), undefined);
  const buildCountBeforeFailedClone = (database.prepare("select count(*) as count from player_builds").get() as { count: number }).count;
  database.prepare("update entities set retired = 1 where id = 'mod'").run();
  assert.throws(() => cloneSharedBuild(database, other, shareKey), /Unknown active entity mod:serration/);
  assert.equal((database.prepare("select count(*) as count from player_builds").get() as { count: number }).count, buildCountBeforeFailedClone);
  database.prepare("update entities set retired = 0 where id = 'mod'").run();
  const cloneId = clonePlayerBuild(database, owner, buildId);
  const clone = getPlayerBuild(database, owner, cloneId)!;
  assert.equal(clone.title, "Changed setup (copy)");
  assert.equal(clone.equipment.find(({ slot }) => slot === "primary")?.mods[0]?.entity.name, "Serration");
  assert.equal(clone.equipment.find(({ slot }) => slot === "primary")?.configuration, "Incarnon");
  assert.equal(clone.enhancements.length, 3);
  revokeBuildShare(database, owner, buildId, shareKey);
  assert.equal(findSharedBuild(database, shareKey), undefined);
  assert.throws(() => revokeBuildShare(database, other, buildId, shareKey), /not found/);
  assert.notEqual(getPlayerBuild(database, owner, buildId)?.revision, shared.revision);
  assert.throws(() => setBuildEquipment(database, other, buildId, "primary", { kind: "weapon", slug: "paris" }), /not found/);
  assert.throws(() => setBuildEnhancement(database, owner, buildId, "archon-shard-3", { kind: "arcane", slug: "arcane-barrier" }), /requires a shard/);
  assert.throws(() => setBuildEnhancement(database, owner, buildId, "archon-shard-3", { kind: "shard", slug: "crimson-archon-shard" }), /require a sourced effect/);
  assert.throws(() => setBuildEnhancement(database, owner, buildId, "archon-shard-3", { kind: "shard", slug: "crimson-archon-shard" }, undefined, "missing"), /not active/);
  assert.throws(() => cloneSharedBuild(database, other, "missing-share"), /not found/);
});

test("cloned build titles stay within the draft title limit", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-build-title-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "builds.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const owner = createLocalUser(database, { username: "Builder" });
  const buildId = createPlayerBuild(database, owner, { title: "x".repeat(160) });
  const clone = getPlayerBuild(database, owner, clonePlayerBuild(database, owner, buildId))!;
  assert.equal(clone.title.length, 160);
  assert.match(clone.title, / \(copy\)$/);
});

function seedEntity(database: ReturnType<typeof openSqliteDatabase>, id: string, kind: string, name: string, slug: string) {
  database.prepare("insert into entities (id, kind, name, slug, retired, updated_at) values (?, ?, ?, ?, 0, ?)").run(id, kind, name, slug, Date.now());
}

function seedEnhancementOption(database: ReturnType<typeof openSqliteDatabase>, entityId: string, key: string, label: string) {
  database.prepare("insert into sources (id, name, homepage, priority, enabled) values ('shard-facts', 'Shard facts', 'https://example.test/shards', 100, 1)").run();
  database.prepare("insert into source_runs (id, source_id, version, content_hash, retrieved_at, status) values ('shard-run', 'shard-facts', 'v1', 'hash', ?, 'active')").run(Date.now());
  database.prepare("insert into entity_enhancement_options (id, entity_id, key, label, source_run_id, source_record_key, citation_url) values ('option', ?, ?, ?, 'shard-run', 'record', 'https://example.test/shards')").run(entityId, key, label);
}
