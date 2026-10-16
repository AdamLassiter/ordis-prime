import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createLocalUser,
  createWorldStateWatch,
  evaluateWorldStateWatches,
  listPlayerNotifications,
  listWorldStateWatches,
  markPlayerNotificationRead,
  migrateDatabase,
  openSqliteDatabase,
  promoteWorldState,
  pruneReadExpiredPlayerNotifications,
  setWorldStateWatchEnabled,
  updateWorldStateWatch,
} from "../src/index.ts";

test("world-state watches create private notifications once per normalized occurrence", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-watches-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "watches.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const firstUser = createLocalUser(database, { username: "First" });
  const secondUser = createLocalUser(database, { username: "Second" });
  const firstWatch = createWorldStateWatch(database, firstUser, {
    kind: "cycle",
    labelContains: "cetus",
    trigger: "ending",
    leadMinutes: 10,
  });
  createWorldStateWatch(database, secondUser, {
    kind: "cycle",
    labelContains: "vallis",
    trigger: "ending",
    leadMinutes: 10,
  });
  const activation = "2026-10-13T20:00:00.000Z";
  const expiry = "2026-10-13T21:00:00.000Z";
  promoteWorldState(database, {
    source: {
      id: "test-world",
      name: "Test world",
      homepage: "https://example.test",
      priority: 1,
    },
    version: "2026-10-13T20:30:00.000Z",
    contentHash: "hash",
    observedAt: "2026-10-13T20:30:00.000Z",
    snapshotPath: "/snapshot",
    windows: [
      {
        externalId: "cycle:cetus",
        kind: "cycle",
        label: "Cetus",
        state: "night",
        activation,
        expiry,
        evidence: {
          sourceId: "test-world",
          sourceRecordKey: "cetus",
          snapshotVersion: "2026-10-13T20:30:00.000Z",
          retrievedAt: "2026-10-13T20:30:00.000Z",
        },
      },
    ],
  });
  const now = Date.parse("2026-10-13T20:55:00.000Z");
  setWorldStateWatchEnabled(database, firstUser, firstWatch, false);
  assert.equal(evaluateWorldStateWatches(database, now), 0);
  assert.equal(listWorldStateWatches(database, firstUser)[0]?.enabled, false);
  assert.throws(
    () => setWorldStateWatchEnabled(database, secondUser, firstWatch, true),
    /not found/,
  );
  setWorldStateWatchEnabled(database, firstUser, firstWatch, true);
  assert.equal(evaluateWorldStateWatches(database, now), 1);
  assert.equal(evaluateWorldStateWatches(database, now + 1_000), 0);
  assert.equal(listPlayerNotifications(database, firstUser).length, 1);
  assert.equal(
    listPlayerNotifications(database, firstUser)[0]?.title,
    "Cetus is ending soon",
  );
  assert.equal(listPlayerNotifications(database, secondUser).length, 0);
  const notificationId = listPlayerNotifications(database, firstUser)[0]!.id;
  assert.throws(
    () => markPlayerNotificationRead(database, secondUser, notificationId),
    /not found/,
  );
  markPlayerNotificationRead(database, firstUser, notificationId);
  assert.notEqual(
    listPlayerNotifications(database, firstUser)[0]?.readAt,
    undefined,
  );
  assert.equal(pruneReadExpiredPlayerNotifications(database, now, 0), 0);
  assert.throws(
    () =>
      updateWorldStateWatch(database, secondUser, firstWatch, {
        kind: "cycle",
        labelContains: "Cetus",
        trigger: "active",
        leadMinutes: 0,
      }),
    /not found/,
  );
  updateWorldStateWatch(database, firstUser, firstWatch, {
    kind: "cycle",
    labelContains: "  Cetus  ",
    stateEquals: "night",
    trigger: "active",
    leadMinutes: 0,
  });
  assert.deepEqual(listWorldStateWatches(database, firstUser)[0], {
    id: firstWatch,
    kind: "cycle",
    labelContains: "Cetus",
    stateEquals: "night",
    nodeContains: undefined,
    entity: undefined,
    trigger: "active",
    leadMinutes: 0,
    enabled: true,
    createdAt: listWorldStateWatches(database, firstUser)[0]!.createdAt,
  });
  assert.equal(evaluateWorldStateWatches(database, now + 2_000), 0);
  assert.equal(listPlayerNotifications(database, firstUser).length, 1);
  assert.equal(
    pruneReadExpiredPlayerNotifications(database, Date.parse(expiry) + 1, 0),
    1,
  );
  assert.equal(listPlayerNotifications(database, firstUser).length, 0);
  assert.equal(evaluateWorldStateWatches(database, Date.parse(expiry) + 1), 0);
  assert.throws(
    () => pruneReadExpiredPlayerNotifications(database, now, -1),
    /non-negative integer/,
  );
});

test("node-linked watches match canonical reconciled nodes rather than similar labels", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-node-watch-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "watches.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const userId = createLocalUser(database, { username: "Node watcher" });
  database
    .prepare(
      "insert into entities (id, kind, name, slug, retired, updated_at) values ('node-tessera', 'node', 'Tessera', 'tessera', 0, ?)",
    )
    .run(Date.now());
  database
    .prepare(
      "insert into entity_aliases (entity_id, normalized, display) values ('node-tessera', 'tesserarelay', 'Tessera Relay')",
    )
    .run();
  const watchId = createWorldStateWatch(database, userId, {
    kind: "fissure",
    trigger: "active",
    leadMinutes: 0,
    entity: { kind: "node", slug: "tessera" },
  });
  promoteWorldState(database, {
    source: {
      id: "test-world",
      name: "Test world",
      homepage: "https://example.test",
      priority: 1,
    },
    version: "node-window-v1",
    contentHash: "node-hash",
    observedAt: "2026-10-13T20:30:00.000Z",
    snapshotPath: "/snapshot",
    windows: [
      {
        externalId: "fissure:tessera",
        kind: "fissure",
        label: "Lith fissure",
        nodeLabel: "Tessera Relay (Venus)",
        expiry: "2026-10-13T22:00:00.000Z",
        evidence: {
          sourceId: "test-world",
          sourceRecordKey: "tessera",
          snapshotVersion: "node-window-v1",
          retrievedAt: "2026-10-13T20:30:00.000Z",
        },
      },
      {
        externalId: "fissure:tessera-prime",
        kind: "fissure",
        label: "Lith fissure",
        nodeLabel: "Tessera Prime",
        expiry: "2026-10-13T22:00:00.000Z",
        evidence: {
          sourceId: "test-world",
          sourceRecordKey: "other",
          snapshotVersion: "node-window-v1",
          retrievedAt: "2026-10-13T20:30:00.000Z",
        },
      },
    ],
  });
  assert.equal(
    evaluateWorldStateWatches(database, Date.parse("2026-10-13T21:00:00.000Z")),
    1,
  );
  assert.equal(listPlayerNotifications(database, userId).length, 1);
  assert.deepEqual(listWorldStateWatches(database, userId)[0]?.entity, {
    kind: "node",
    slug: "tessera",
    name: "Tessera",
  });
  assert.throws(
    () =>
      updateWorldStateWatch(database, userId, watchId, {
        kind: "fissure",
        trigger: "active",
        leadMinutes: 0,
        entity: { kind: "node", slug: "missing" },
      }),
    /Unknown active entity/,
  );
});

test("item-linked watches match exact reconciled window subjects", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-subject-watch-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "watches.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const userId = createLocalUser(database, { username: "Item watcher" });
  database
    .prepare(
      "insert into entities (id, kind, name, slug, retired, updated_at) values ('forma', 'resource', 'Forma', 'forma', 0, ?)",
    )
    .run(Date.now());
  database
    .prepare(
      "insert into entities (id, kind, name, slug, retired, updated_at) values ('forma-cosmetic', 'cosmetic', 'Forma', 'forma-cosmetic', 0, ?)",
    )
    .run(Date.now());
  database
    .prepare(
      "insert into sources (id, name, homepage, priority, enabled) values ('wfcd-items', 'WFCD items', 'https://example.test/items', 1, 1)",
    )
    .run();
  database
    .prepare(
      "insert into external_ids (entity_id, source_id, namespace, value) values ('forma', 'wfcd-items', 'uniqueName', '/Lotus/StoreItems/Types/Recipes/Components/FormaBlueprint')",
    )
    .run();
  createWorldStateWatch(database, userId, {
    kind: "alert",
    trigger: "active",
    leadMinutes: 0,
    entity: { kind: "resource", slug: "forma" },
  });
  promoteWorldState(database, {
    source: {
      id: "test-world",
      name: "Test world",
      homepage: "https://example.test",
      priority: 1,
    },
    version: "subject-window-v1",
    contentHash: "subject-hash",
    observedAt: "2026-10-13T20:30:00.000Z",
    snapshotPath: "/snapshot",
    windows: [
      {
        externalId: "alert:forma",
        kind: "alert",
        label: "Alert: Forma",
        subjects: [
          {
            label: "Forma",
            externalIds: [
              {
                sourceId: "wfcd-items",
                namespace: "uniqueName",
                value:
                  "/Lotus/StoreItems/Types/Recipes/Components/FormaBlueprint",
              },
            ],
          },
        ],
        expiry: "2026-10-13T22:00:00.000Z",
        evidence: {
          sourceId: "test-world",
          sourceRecordKey: "forma",
          snapshotVersion: "subject-window-v1",
          retrievedAt: "2026-10-13T20:30:00.000Z",
        },
      },
      {
        externalId: "alert:forma-blueprint",
        kind: "alert",
        label: "Alert: Forma Blueprint",
        subjects: [{ label: "Forma Blueprint" }],
        expiry: "2026-10-13T22:00:00.000Z",
        evidence: {
          sourceId: "test-world",
          sourceRecordKey: "forma-blueprint",
          snapshotVersion: "subject-window-v1",
          retrievedAt: "2026-10-13T20:30:00.000Z",
        },
      },
    ],
  });

  assert.equal(
    evaluateWorldStateWatches(database, Date.parse("2026-10-13T21:00:00.000Z")),
    1,
  );
  assert.deepEqual(
    listPlayerNotifications(database, userId).map(({ title }) => title),
    ["Alert: Forma is active"],
  );
});
