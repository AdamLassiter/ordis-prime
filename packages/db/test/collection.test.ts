import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createLocalUser,
  listMasteryHelper,
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

test("mastery helper orders unmastered equipment by missing recipe components and cached market cost", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-mastery-helper-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "collection.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  sqlite
    .prepare(
      "insert into sources (id,name,homepage,priority,enabled) values ('facts','Facts','https://example.test',100,1),('warframe-market-items','Market','https://warframe.market',20,1)",
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
  insert.run("ready", "weapon", "Already Built", "already-built");
  insert.run("near", "warframe", "Nearly Complete", "nearly-complete");
  insert.run("unknown", "companion", "No Recipe", "no-recipe");
  insert.run("mastered", "weapon", "Mastered", "mastered");
  insert.run("part-a", "component", "Tradeable Part A", "part-a");
  insert.run("part-b", "component", "Tradeable Part B", "part-b");
  insert.run("resource", "resource", "Common Resource", "common-resource");
  sqlite
    .prepare(
      "insert into recipes (id,output_id,source_run_id,source_record_key) values ('near-recipe','near','facts-run','near')",
    )
    .run();
  const ingredient = sqlite.prepare(
    "insert into recipe_ingredients (recipe_id,entity_id,quantity) values ('near-recipe',?,?)",
  );
  ingredient.run("part-a", 2);
  ingredient.run("part-b", 1);
  ingredient.run("resource", 5);
  const marketId = sqlite.prepare(
    "insert into external_ids (entity_id,source_id,namespace,value) values (?,'warframe-market-items','item-slug',?)",
  );
  marketId.run("part-a", "tradeable_part_a");
  marketId.run("part-b", "tradeable_part_b");
  sqlite
    .prepare(
      "insert into market_price_runs (id,status,started_at,finished_at,target_count,completed_count,failed_count) values ('prices','succeeded',1000,1000,1,1,0)",
    )
    .run();
  sqlite
    .prepare(
      "insert into market_price_snapshots (id,run_id,entity_id,item_id,slug,observed_at,listing_price,quick_sale_price,sell_order_count,buy_order_count) values ('part-a-price','prices','part-a','market-a','tradeable_part_a',1000,6,5,5,1)",
    )
    .run();
  const userId = createLocalUser(sqlite, { username: "Mastery Helper" });
  setInventoryEntry(sqlite, userId, "ready", {
    ownedCount: 0,
    builtCount: 1,
    wantedCount: 0,
    mastered: false,
  });
  setInventoryEntry(sqlite, userId, "near", {
    ownedCount: 0,
    builtCount: 0,
    wantedCount: 0,
    mastered: false,
  });
  setInventoryEntry(sqlite, userId, "mastered", {
    ownedCount: 0,
    builtCount: 0,
    wantedCount: 0,
    mastered: true,
  });
  setInventoryEntry(sqlite, userId, "part-a", {
    ownedCount: 1,
    builtCount: 0,
    wantedCount: 0,
  });
  setInventoryEntry(sqlite, userId, "resource", {
    ownedCount: 5,
    builtCount: 0,
    wantedCount: 0,
  });

  const helper = listMasteryHelper(sqlite, userId, {
    now: 1000,
    pageSize: 20,
  });
  assert.deepEqual(
    helper.entries.map((entry) => entry.entityId),
    ["ready", "near", "unknown"],
  );
  assert.equal(helper.entries[0]?.missingComponentCount, 0);
  const near = helper.entries[1]!;
  assert.equal(near.missingComponentCount, 2);
  assert.equal(near.missingComponentCopies, 2);
  assert.equal(near.tradeableMissingComponents, 2);
  assert.equal(near.pricedMissingComponents, 1);
  assert.equal(near.knownPlatinumCost, 6);
  assert.deepEqual(
    near.components.map((component) => [
      component.entityId,
      component.missingCount,
      component.totalPlatinum,
    ]),
    [
      ["part-a", 1, 6],
      ["part-b", 1, undefined],
    ],
  );
  assert.equal(helper.entries[2]?.missingComponentCount, undefined);

  const expired = listMasteryHelper(sqlite, userId, {
    now: 1000 + 8 * 24 * 60 * 60_000,
    pageSize: 20,
  }).entries.find((entry) => entry.entityId === "near")!;
  assert.equal(expired.tradeableMissingComponents, 2);
  assert.equal(expired.pricedMissingComponents, 0);
  assert.equal(expired.knownPlatinumCost, undefined);
});
