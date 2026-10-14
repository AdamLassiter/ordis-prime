import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addBuildAcquisitionGoals, clonePlayerBuild, cloneSharedBuild, configureBuildEquipment, createBuildShare, createLocalUser, createPlayerBuild, findSharedBuild, getPlayerBuild, listBuildShares, listPlayerGoals, migrateDatabase, openSqliteDatabase, revokeBuildShare, searchBuildCandidates, setBuildEquipment, setBuildMod, setInventoryEntry, setPlayerGoal, updatePlayerBuild } from "../src/index.ts";

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
  assert.deepEqual(searchBuildCandidates(database, "primary", "Par"), [{ kind: "weapon", slug: "paris", name: "Paris" }]);
  assert.deepEqual(searchBuildCandidates(database, "mod", "Serr"), [{ kind: "mod", slug: "serration", name: "Serration" }]);
  const buildId = createPlayerBuild(database, owner, { title: "Starter setup", category: "beginner" });
  setBuildEquipment(database, owner, buildId, "warframe", { kind: "warframe", slug: "mag" });
  setBuildEquipment(database, owner, buildId, "primary", { kind: "weapon", slug: "paris" });
  configureBuildEquipment(database, owner, buildId, "primary", { configuration: "Incarnon", formaCount: 3, capacityUpgrade: true });
  setBuildMod(database, owner, buildId, "primary", 0, { kind: "mod", slug: "serration" }, 5);
  assert.equal(getPlayerBuild(database, other, buildId), undefined);
  assert.equal(getPlayerBuild(database, owner, buildId)?.equipment.find(({ slot }) => slot === "primary")?.mods[0]?.entity.name, "Serration");
  assert.deepEqual(getPlayerBuild(database, owner, buildId)?.equipment.find(({ slot }) => slot === "primary"), {
    id: getPlayerBuild(database, owner, buildId)?.equipment.find(({ slot }) => slot === "primary")?.id,
    slot: "primary", entity: { kind: "weapon", slug: "paris", name: "Paris" }, configuration: "Incarnon", formaCount: 3, capacityUpgrade: true,
    notes: undefined, mods: [{ position: 0, rank: 5, entity: { kind: "mod", slug: "serration", name: "Serration" } }],
  });
  setPlayerGoal(database, owner, { kind: "mod", slug: "serration" }, 3);
  assert.equal(addBuildAcquisitionGoals(database, owner, buildId), 2);
  assert.deepEqual(listPlayerGoals(database, owner).map(({ name, targetQuantity }) => ({ name, targetQuantity })), [{ name: "Mag", targetQuantity: 1 }, { name: "Paris", targetQuantity: 1 }, { name: "Serration", targetQuantity: 3 }]);
  setInventoryEntry(database, owner, "weapon", { ownedCount: 0, builtCount: 1, wantedCount: 0 });
  assert.equal(addBuildAcquisitionGoals(database, owner, buildId), 0);

  const shareKey = createBuildShare(database, owner, buildId);
  const shared = findSharedBuild(database, shareKey)!;
  updatePlayerBuild(database, owner, buildId, { title: "Changed setup" });
  assert.equal(shared.title, "Starter setup");
  assert.equal(shared.equipment.find(({ slot }) => slot === "primary")?.configuration, "Incarnon");
  assert.deepEqual(listBuildShares(database, owner, buildId).map(({ shareKey: _shareKey, ...entry }) => entry), [{ revision: shared.revision, createdAt: shared.sharedAt }]);
  const publicCloneId = cloneSharedBuild(database, other, shareKey);
  const publicClone = getPlayerBuild(database, other, publicCloneId)!;
  assert.equal(publicClone.title, "Starter setup (copy)");
  assert.equal(publicClone.equipment.find(({ slot }) => slot === "primary")?.configuration, "Incarnon");
  assert.equal(publicClone.equipment.find(({ slot }) => slot === "primary")?.mods[0]?.rank, 5);
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
  revokeBuildShare(database, owner, buildId, shareKey);
  assert.equal(findSharedBuild(database, shareKey), undefined);
  assert.throws(() => revokeBuildShare(database, other, buildId, shareKey), /not found/);
  assert.notEqual(getPlayerBuild(database, owner, buildId)?.revision, shared.revision);
  assert.throws(() => setBuildEquipment(database, other, buildId, "primary", { kind: "weapon", slug: "paris" }), /not found/);
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
