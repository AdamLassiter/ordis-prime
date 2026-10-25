import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createLocalUser,
  listPlayerCollection,
  migrateDatabase,
  openSqliteDatabase,
  setInventoryEntry,
} from "../src/index.ts";

test("collection workspace joins missing catalog entries and derives stable states", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-collection-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "collection.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  sqlite
    .prepare(
      "insert into sources (id,name,homepage,priority,enabled) values ('facts','Facts','https://example.test',100,1)",
    )
    .run();
  sqlite
    .prepare(
      "insert into source_runs (id,source_id,version,content_hash,retrieved_at,status) values ('facts-run','facts','v1','hash',1000,'active')",
    )
    .run();
  const insert = sqlite.prepare(
    "insert into entities (id,kind,name,slug,retired,updated_at) values (?,?,?,?,0,1000)",
  );
  insert.run("unknown", "weapon", "Alpha Rifle", "alpha-rifle");
  insert.run("mastered", "warframe", "Beta", "beta");
  insert.run("arcane", "arcane", "Arcane Gamma", "arcane-gamma");
  insert.run("resource", "resource", "Credits", "credits");
  insert.run("node", "node", "Earth Node", "earth-node");
  sqlite
    .prepare(
      "insert into recipes (id,output_id,source_run_id,source_record_key) values ('recipe','unknown','facts-run','recipe')",
    )
    .run();
  sqlite
    .prepare(
      "insert into drops (id,reward_id,location_label,source_run_id,source_record_key) values ('drop','unknown','Earth','facts-run','drop')",
    )
    .run();
  const userId = createLocalUser(sqlite, { username: "Collector" });
  setInventoryEntry(sqlite, userId, "mastered", {
    ownedCount: 0,
    builtCount: 0,
    wantedCount: 0,
    mastered: true,
  });
  setInventoryEntry(sqlite, userId, "arcane", {
    ownedCount: 0,
    builtCount: 0,
    wantedCount: 2,
  });

  const page = listPlayerCollection(sqlite, userId, { pageSize: 20 });
  assert.deepEqual(
    page.entries.map((entry) => entry.entityId),
    ["unknown", "arcane", "mastered"],
  );
  const unknown = page.entries.find((entry) => entry.entityId === "unknown")!;
  assert.equal(unknown.acquired, false);
  assert.equal(unknown.implicitlyWanted, true);
  assert.deepEqual(unknown.acquisition, {
    recipes: true,
    drops: true,
    rotations: false,
    vendors: false,
    market: false,
  });
  const mastered = page.entries.find((entry) => entry.entityId === "mastered")!;
  assert.equal(mastered.acquired, false);
  assert.equal(mastered.mastered, true);
  assert.equal(mastered.implicitlyWanted, false);
  const arcane = page.entries.find((entry) => entry.entityId === "arcane")!;
  assert.equal(arcane.masteryCapable, false);
  assert.equal(arcane.explicitlyWanted, true);
  assert.equal(arcane.implicitlyWanted, false);
  assert.equal(page.summary.masteryUnknown, 1);
  assert.deepEqual(
    listPlayerCollection(sqlite, userId, {
      state: "implicit-wanted",
      pageSize: 20,
    }).entries.map((entry) => entry.entityId),
    ["unknown"],
  );
});
