import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { migrateDatabase, openSqliteDatabase } from "@ordis-prime/db";
import { createSnapshot, runWorkerCycle, SnapshotStore, WfcdWorldStateAdapter, type Snapshot, type WorldStateAdapter } from "../src/index.ts";

test("worker refreshes once, waits for its interval, and retries failures sooner", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-worker-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "worker.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const parser = new WfcdWorldStateAdapter("https://example.test");
  let shouldFail = false;
  const adapter: WorldStateAdapter = {
    source: parser.source,
    fetch: async () => {
      if (shouldFail) throw new Error("provider unavailable");
      return fixtureSnapshot();
    },
    parse: (snapshot) => parser.parse(snapshot),
  };
  const options = { database, snapshotStore: new SnapshotStore(path.join(root, "sources")), worldStateAdapter: adapter, owner: "worker-test", refreshIntervalMilliseconds: 300, retryIntervalMilliseconds: 50 };

  assert.deepEqual(await runWorkerCycle({ ...options, now: 100 }), { status: "succeeded", notificationsCreated: 0 });
  assert.deepEqual(await runWorkerCycle({ ...options, now: 399 }), { status: "idle" });
  shouldFail = true;
  assert.deepEqual(await runWorkerCycle({ ...options, now: 400 }), { status: "failed", error: "provider unavailable" });
  assert.deepEqual(await runWorkerCycle({ ...options, now: 449 }), { status: "idle" });
  shouldFail = false;
  assert.deepEqual(await runWorkerCycle({ ...options, now: 450 }), { status: "succeeded", notificationsCreated: 0 });
  assert.equal((database.prepare("select count(*) as count from jobs where status = 'running'").get() as { count: number }).count, 0);
});

function fixtureSnapshot(): Snapshot {
  const timestamp = "2026-10-13T21:00:00.000Z";
  return createSnapshot({
    sourceId: "wfcd-worldstate",
    version: timestamp,
    retrievedAt: timestamp,
    mediaType: "application/json",
    bytes: new TextEncoder().encode(JSON.stringify({ timestamp, cetusCycle: { id: "cetus", activation: "2026-10-13T20:30:00.000Z", expiry: "2026-10-13T22:00:00.000Z", state: "night" } })),
  });
}
