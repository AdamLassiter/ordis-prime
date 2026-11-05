import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { migrateDatabase, openSqliteDatabase } from "@ordis-prime/db";
import {
  parseOrders,
  refreshMarketPriceBatch,
  summarizeVariant,
} from "../src/index.ts";

test("market price summaries filter online variants and normalize bulk trades", () => {
  const order = (
    type: "sell" | "buy",
    platinum: number,
    options: Record<string, unknown> = {},
  ) => ({
    type,
    platinum,
    quantity: 10,
    perTrade: 1,
    visible: true,
    user: { status: "online" },
    ...options,
  });
  const parsed = parseOrders({
    apiVersion: "fixture",
    error: null,
    data: [
      order("sell", 2, { subtype: "radiant" }),
      order("sell", 3, { subtype: "radiant" }),
      order("sell", 4, { subtype: "radiant" }),
      order("sell", 5, { subtype: "radiant" }),
      order("sell", 100, { subtype: "radiant" }),
      order("sell", 12, { subtype: "radiant", perTrade: 6 }),
      order("buy", 2, { subtype: "radiant" }),
      order("buy", 1, { subtype: "radiant" }),
      order("sell", 1, { subtype: "intact" }),
      {
        ...order("sell", 1, { subtype: "radiant" }),
        user: { status: "offline" },
      },
    ],
  });
  assert.deepEqual(
    summarizeVariant(parsed, { subtype: "radiant", rank: null }),
    {
      listingPrice: 3,
      quickSalePrice: 2,
      sellOrderCount: 6,
      buyOrderCount: 2,
    },
  );
});

test("market price summaries distinguish a valid empty book", () => {
  assert.deepEqual(
    summarizeVariant(
      parseOrders({ apiVersion: "fixture", error: null, data: [] }),
      {
        subtype: null,
        rank: 0,
      },
    ),
    {
      listingPrice: null,
      quickSalePrice: null,
      sellOrderCount: 0,
      buyOrderCount: 0,
    },
  );
});

test("background price runs include tradeable mastery recipe components", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-market-mastery-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "market.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  database
    .prepare(
      "insert into sources (id,name,homepage,priority,enabled) values ('facts','Facts','https://example.test',100,1),('warframe-market-items','Market','https://warframe.market',20,1)",
    )
    .run();
  database
    .prepare(
      "insert into source_runs (id,source_id,version,content_hash,retrieved_at,status) values ('facts-run','facts','v1','hash',1000,'active')",
    )
    .run();
  database
    .prepare(
      "insert into entities (id,kind,name,slug,retired,updated_at) values ('weapon','weapon','Fixture Weapon','fixture-weapon',0,1000),('part','component','Fixture Part','fixture-part',0,1000)",
    )
    .run();
  database
    .prepare(
      "insert into recipes (id,output_id,source_run_id,source_record_key) values ('recipe','weapon','facts-run','recipe')",
    )
    .run();
  database
    .prepare(
      "insert into recipe_ingredients (recipe_id,entity_id,quantity) values ('recipe','part',1)",
    )
    .run();
  database
    .prepare(
      "insert into external_ids (entity_id,source_id,namespace,value) values ('part','warframe-market-items','item-id','market-part'),('part','warframe-market-items','item-slug','fixture_part')",
    )
    .run();
  const requests: string[] = [];
  const result = await refreshMarketPriceBatch({
    database,
    now: 1000,
    batchSize: 1,
    requestDelayMilliseconds: 0,
    fetchImpl: async (input) => {
      requests.push(String(input));
      return new Response(
        JSON.stringify({ apiVersion: "fixture", error: null, data: [] }),
        { status: 200 },
      );
    },
  });
  assert.equal(result.complete, true);
  assert.equal(result.targetCount, 1);
  assert.deepEqual(requests, [
    "https://api.warframe.market/v2/orders/item/fixture_part",
  ]);
});
