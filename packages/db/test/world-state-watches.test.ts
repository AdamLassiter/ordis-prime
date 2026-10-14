import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalUser, createWorldStateWatch, evaluateWorldStateWatches, listPlayerNotifications, listWorldStateWatches, markPlayerNotificationRead, migrateDatabase, openSqliteDatabase, promoteWorldState, setWorldStateWatchEnabled, updateWorldStateWatch } from "../src/index.ts";

test("world-state watches create private notifications once per normalized occurrence", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-watches-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "watches.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const firstUser = createLocalUser(database, { username: "First" });
  const secondUser = createLocalUser(database, { username: "Second" });
  const firstWatch = createWorldStateWatch(database, firstUser, { kind: "cycle", labelContains: "cetus", trigger: "ending", leadMinutes: 10 });
  createWorldStateWatch(database, secondUser, { kind: "cycle", labelContains: "vallis", trigger: "ending", leadMinutes: 10 });
  const activation = "2026-10-13T20:00:00.000Z";
  const expiry = "2026-10-13T21:00:00.000Z";
  promoteWorldState(database, {
    source: { id: "test-world", name: "Test world", homepage: "https://example.test", priority: 1 },
    version: "2026-10-13T20:30:00.000Z", contentHash: "hash", observedAt: "2026-10-13T20:30:00.000Z", snapshotPath: "/snapshot",
    windows: [{ externalId: "cycle:cetus", kind: "cycle", label: "Cetus", state: "night", activation, expiry, evidence: { sourceId: "test-world", sourceRecordKey: "cetus", snapshotVersion: "2026-10-13T20:30:00.000Z", retrievedAt: "2026-10-13T20:30:00.000Z" } }],
  });
  const now = Date.parse("2026-10-13T20:55:00.000Z");
  setWorldStateWatchEnabled(database, firstUser, firstWatch, false);
  assert.equal(evaluateWorldStateWatches(database, now), 0);
  assert.equal(listWorldStateWatches(database, firstUser)[0]?.enabled, false);
  assert.throws(() => setWorldStateWatchEnabled(database, secondUser, firstWatch, true), /not found/);
  setWorldStateWatchEnabled(database, firstUser, firstWatch, true);
  assert.equal(evaluateWorldStateWatches(database, now), 1);
  assert.equal(evaluateWorldStateWatches(database, now + 1_000), 0);
  assert.equal(listPlayerNotifications(database, firstUser).length, 1);
  assert.equal(listPlayerNotifications(database, firstUser)[0]?.title, "Cetus is ending soon");
  assert.equal(listPlayerNotifications(database, secondUser).length, 0);
  const notificationId = listPlayerNotifications(database, firstUser)[0]!.id;
  assert.throws(() => markPlayerNotificationRead(database, secondUser, notificationId), /not found/);
  markPlayerNotificationRead(database, firstUser, notificationId);
  assert.notEqual(listPlayerNotifications(database, firstUser)[0]?.readAt, undefined);
  assert.throws(() => updateWorldStateWatch(database, secondUser, firstWatch, { kind: "cycle", labelContains: "Cetus", trigger: "active", leadMinutes: 0 }), /not found/);
  updateWorldStateWatch(database, firstUser, firstWatch, { kind: "cycle", labelContains: "  Cetus  ", stateEquals: "night", trigger: "active", leadMinutes: 0 });
  assert.deepEqual(listWorldStateWatches(database, firstUser)[0], {
    id: firstWatch, kind: "cycle", labelContains: "Cetus", stateEquals: "night", nodeContains: undefined,
    trigger: "active", leadMinutes: 0, enabled: true, createdAt: listWorldStateWatches(database, firstUser)[0]!.createdAt,
  });
  assert.equal(evaluateWorldStateWatches(database, now + 2_000), 0);
  assert.equal(listPlayerNotifications(database, firstUser).length, 1);
});
