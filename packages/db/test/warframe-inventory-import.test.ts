import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createLocalUser,
  findPlayerInventoryEntry,
  importWarframeInventory,
  migrateDatabase,
  openSqliteDatabase,
  parseWarframeInventory,
  setInventoryEntry,
} from "../src/index.ts";

test("raw Warframe inventory parsing is bounded and fail-closed", () => {
  assert.throws(
    () => parseWarframeInventory({ AccountId: "secret" }),
    /no supported item groups/,
  );
  assert.throws(
    () => parseWarframeInventory({ Suits: {} }),
    /Suits must be an array/,
  );
  assert.throws(
    () => parseWarframeInventory({ Suits: [{ ItemType: "Excalibur" }] }),
    /Suits\[0\] is invalid/,
  );
  assert.throws(
    () =>
      parseWarframeInventory({
        MiscItems: [{ ItemType: "/Lotus/Types/Items/Foo", ItemCount: -1 }],
      }),
    /ItemCount is invalid/,
  );
  assert.deepEqual(parseWarframeInventory({ Suits: [], InfestedFoundry: {} }), {
    counts: new Map(),
    subsumed: new Set(),
    parsedRecords: 0,
  });
});

test("inventory snapshots merge stable WFCD paths without reducing manual state", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-game-inventory-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "inventory.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const userId = createLocalUser(database, { username: "Tenno" });
  database
    .prepare(
      "insert into sources (id, name, homepage, priority, enabled) values ('wfcd-items', 'WFCD', 'https://example.test', 100, 1)",
    )
    .run();
  seedEntity(database, "frame", "warframe", "Excalibur", "excalibur");
  seedEntity(database, "resource", "resource", "Ferrite", "ferrite");
  seedEntity(database, "subsumed", "warframe", "Mag", "mag");
  seedIdentifier(database, "frame", "/Lotus/Powersuits/Excalibur/Excalibur");
  seedIdentifier(database, "resource", "/Lotus/Types/Items/MiscItems/Ferrite");
  seedIdentifier(database, "subsumed", "/Lotus/Powersuits/Mag/Mag");
  setInventoryEntry(database, userId, "frame", {
    ownedCount: 3,
    builtCount: 1,
    wantedCount: 2,
    note: "Preserve me",
  });

  const result = importWarframeInventory(database, userId, {
    AccountId: "must-not-be-stored",
    Suits: [
      { ItemType: "/Lotus/Powersuits/Excalibur/Excalibur" },
      { ItemType: "/Lotus/Powersuits/Excalibur/Excalibur" },
      { ItemType: "/Lotus/Powersuits/Unknown/Unknown" },
    ],
    MiscItems: [
      {
        ItemType: "/Lotus/Types/Items/MiscItems/Ferrite",
        ItemCount: 120,
      },
    ],
    InfestedFoundry: {
      ConsumedSuits: [{ s: "/Lotus/Powersuits/Mag/Mag" }],
    },
  });
  assert.deepEqual(result, {
    parsedRecords: 5,
    resolvedItems: 3,
    changedItems: 2,
    unresolvedItemTypes: ["/Lotus/Powersuits/Unknown/Unknown"],
    unresolvedCount: 1,
  });
  assert.deepEqual(
    findPlayerInventoryEntry(database, userId, "warframe", "excalibur"),
    {
      entityId: "frame",
      kind: "warframe",
      slug: "excalibur",
      name: "Excalibur",
      ownedCount: 3,
      builtCount: 1,
      wantedCount: 2,
      mastered: undefined,
      subsumed: undefined,
      note: "Preserve me",
    },
  );
  assert.equal(
    findPlayerInventoryEntry(database, userId, "resource", "ferrite")
      ?.ownedCount,
    120,
  );
  assert.equal(
    findPlayerInventoryEntry(database, userId, "warframe", "mag")?.subsumed,
    true,
  );
  assert.deepEqual(
    database
      .prepare(
        "select count(*) as count from player_inventory where note = 'must-not-be-stored'",
      )
      .get(),
    { count: 0 },
  );
});

function seedEntity(
  database: ReturnType<typeof openSqliteDatabase>,
  id: string,
  kind: string,
  name: string,
  slug: string,
) {
  database
    .prepare(
      "insert into entities (id, kind, name, slug, retired, updated_at) values (?, ?, ?, ?, 0, ?)",
    )
    .run(id, kind, name, slug, Date.now());
}

function seedIdentifier(
  database: ReturnType<typeof openSqliteDatabase>,
  entityId: string,
  value: string,
) {
  database
    .prepare(
      "insert into external_ids (entity_id, source_id, namespace, value) values (?, 'wfcd-items', 'uniqueName', ?)",
    )
    .run(entityId, value);
}
