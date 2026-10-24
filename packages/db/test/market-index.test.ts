import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  listRelicMarketIndex,
  migrateDatabase,
  openSqliteDatabase,
} from "../src/index.ts";

test("relic index separates sealed price, solo EV, squad EV, and trace return", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-index-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "index.sqlite");
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
      "insert into sources (id,name,homepage,priority,enabled) values ('warframe-market-items','Market','https://example.test',20,1)",
    )
    .run();
  sqlite
    .prepare(
      "insert into source_runs (id,source_id,version,content_hash,retrieved_at,status,observation_count) values ('facts-run','facts','v1','hash',1000,'active',1)",
    )
    .run();
  const insertEntity = sqlite.prepare(
    "insert into entities (id,kind,name,slug,retired,updated_at) values (?,?,?,?,0,1000)",
  );
  insertEntity.run("relic", "relic", "Lith T1 Relic", "lith-t1-relic");
  sqlite
    .prepare(
      "insert into external_ids (entity_id,source_id,namespace,value) values ('relic','warframe-market-items','item-slug','lith_t1_relic')",
    )
    .run();
  sqlite
    .prepare(
      "insert into entity_attributes (id,entity_id,key,label,value,source_run_id,source_record_key) values ('vaulted','relic','vaulted','Vaulted','false','facts-run','vaulted')",
    )
    .run();
  const values = [100, 20, 20, 5, 5, 5];
  const radiant = [0.1, 0.2, 0.2, 1 / 6, 1 / 6, 1 / 6];
  const intact = [
    0.02, 0.11, 0.11, 0.253333333333, 0.253333333333, 0.253333333334,
  ];
  for (let index = 0; index < 6; index += 1) {
    const id = `reward-${index}`;
    insertEntity.run(id, "component", `Reward ${index}`, `reward-${index}`);
    sqlite
      .prepare(
        "insert into external_ids (entity_id,source_id,namespace,value) values (?,'warframe-market-items','item-slug',?)",
      )
      .run(id, `reward_${index}`);
    sqlite
      .prepare(
        "insert into entity_attributes (id,entity_id,key,label,value,source_run_id,source_record_key) values (?,?,'ducats','Ducats','15','facts-run',?)",
      )
      .run(`ducats-${index}`, id, `ducats-${index}`);
    for (const [refinement, chance] of [
      ["radiant", radiant[index]],
      ["intact", intact[index]],
    ] as const)
      sqlite
        .prepare(
          "insert into relic_rewards (id,relic_id,reward_id,refinement,rarity,chance,source_run_id,source_record_key) values (?,?,?,?,?,?, 'facts-run',?)",
        )
        .run(
          `${refinement}-${index}`,
          "relic",
          id,
          refinement,
          index === 0 ? "rare" : index < 3 ? "uncommon" : "common",
          chance,
          `${refinement}-${index}`,
        );
  }
  sqlite
    .prepare(
      "insert into market_price_runs (id,status,started_at,finished_at,target_count,completed_count,failed_count) values ('prices','succeeded',1000,1000,7,7,0)",
    )
    .run();
  const insertPrice = sqlite.prepare(
    "insert into market_price_snapshots (id,run_id,entity_id,item_id,slug,subtype,rank,observed_at,listing_price,quick_sale_price,sell_order_count,buy_order_count) values (?,'prices',?,?,?,?,?,1000,?,?,5,1)",
  );
  insertPrice.run(
    "sealed",
    "relic",
    "market-relic",
    "lith_t1_relic",
    "radiant",
    null,
    12,
    10,
  );
  for (let index = 0; index < 6; index += 1)
    insertPrice.run(
      `price-${index}`,
      `reward-${index}`,
      `market-${index}`,
      `reward_${index}`,
      null,
      null,
      values[index],
      values[index] - 1,
    );

  const [row] = listRelicMarketIndex(sqlite, {
    refinement: "radiant",
    basis: "listing",
    squad: "solo",
    now: 1000,
  });
  assert.ok(row);
  assert.equal(row.directValue, 12);
  assert.ok(Math.abs(row.openValue! - 20.5) < 0.0001);
  assert.ok(row.squadOpenValue! > row.soloOpenValue!);
  assert.ok(row.openingDelta! > 8.49 && row.openingDelta! < 8.51);
  assert.equal(row.pricedRewards, 6);
  assert.equal(row.ducatExpectedValue, 15);
  assert.ok(row.traceEfficiency! > 0);
});
