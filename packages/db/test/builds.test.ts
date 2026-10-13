import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { configureBuildEquipment, createBuildShare, createLocalUser, createPlayerBuild, findSharedBuild, getPlayerBuild, migrateDatabase, openSqliteDatabase, searchBuildCandidates, setBuildEquipment, setBuildMod, updatePlayerBuild } from "../src/index.ts";

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

  const shareKey = createBuildShare(database, owner, buildId);
  const shared = findSharedBuild(database, shareKey)!;
  updatePlayerBuild(database, owner, buildId, { title: "Changed setup" });
  assert.equal(shared.title, "Starter setup");
  assert.equal(shared.equipment.find(({ slot }) => slot === "primary")?.configuration, "Incarnon");
  assert.equal(findSharedBuild(database, shareKey)?.title, "Starter setup");
  assert.notEqual(getPlayerBuild(database, owner, buildId)?.revision, shared.revision);
  assert.throws(() => setBuildEquipment(database, other, buildId, "primary", { kind: "weapon", slug: "paris" }), /not found/);
});

function seedEntity(database: ReturnType<typeof openSqliteDatabase>, id: string, kind: string, name: string, slug: string) {
  database.prepare("insert into entities (id, kind, name, slug, retired, updated_at) values (?, ?, ?, ?, 0, ?)").run(id, kind, name, slug, Date.now());
}
