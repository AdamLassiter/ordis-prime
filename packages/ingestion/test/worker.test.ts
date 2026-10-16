import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  beginSourceRefresh,
  migrateDatabase,
  openSqliteDatabase,
} from "@ordis-prime/db";
import {
  createSnapshot,
  runWorkerCycle,
  SnapshotStore,
  WfcdWorldStateAdapter,
  type Snapshot,
  type SourceAdapter,
  type WorldStateAdapter,
} from "../src/index.ts";

test("worker refreshes once, waits for its interval, and retries failures sooner", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-worker-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "worker.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const parser = new WfcdWorldStateAdapter("https://example.test");
  let shouldFail = false;
  let snapshotTimestamp = "2026-10-13T21:00:00.000Z";
  const adapter: WorldStateAdapter = {
    source: parser.source,
    fetch: async () => {
      if (shouldFail) throw new Error("provider unavailable");
      return fixtureSnapshot(snapshotTimestamp);
    },
    parse: (snapshot) => parser.parse(snapshot),
  };
  const options = {
    database,
    snapshotStore: new SnapshotStore(path.join(root, "sources")),
    worldStateAdapter: adapter,
    owner: "worker-test",
    refreshIntervalMilliseconds: 300,
    retryIntervalMilliseconds: 50,
    jobHistoryLimit: 1,
    worldStateSnapshotHistoryLimit: 0,
    sourceRefreshHistoryLimit: 0,
    snapshotPruneGraceMilliseconds: 0,
  };

  assert.deepEqual(await runWorkerCycle({ ...options, now: 100 }), {
    status: "succeeded",
    sourceId: "wfcd-worldstate",
    notificationsCreated: 0,
  });
  assert.deepEqual(await runWorkerCycle({ ...options, now: 399 }), {
    status: "idle",
  });
  assert.equal(
    (
      database
        .prepare("select count(*) as count from source_refreshes")
        .get() as {
        count: number;
      }
    ).count,
    0,
  );
  shouldFail = true;
  assert.deepEqual(await runWorkerCycle({ ...options, now: 400 }), {
    status: "failed",
    sourceId: "wfcd-worldstate",
    error: "provider unavailable",
  });
  assert.deepEqual(await runWorkerCycle({ ...options, now: 449 }), {
    status: "idle",
  });
  shouldFail = false;
  snapshotTimestamp = "2026-10-13T21:05:00.000Z";
  assert.deepEqual(await runWorkerCycle({ ...options, now: 450 }), {
    status: "succeeded",
    sourceId: "wfcd-worldstate",
    notificationsCreated: 0,
  });
  assert.equal(
    (
      database
        .prepare("select count(*) as count from world_state_snapshots")
        .get() as { count: number }
    ).count,
    1,
  );
  assert.equal(
    (
      database
        .prepare("select count(*) as count from jobs where status = 'running'")
        .get() as { count: number }
    ).count,
    0,
  );
  await runWorkerCycle({ ...options, now: 451 });
  assert.equal(
    (
      database
        .prepare(
          "select count(*) as count from jobs where status in ('succeeded', 'failed')",
        )
        .get() as { count: number }
    ).count,
    1,
  );
  assert.equal(
    (
      await fs.readdir(path.join(root, "sources", "wfcd-worldstate"), {
        withFileTypes: true,
      })
    ).filter((entry) => entry.isDirectory()).length,
    1,
  );
});

test("worker schedules static catalog adapters independently of world state", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-worker-catalog-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "worker.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const worldParser = new WfcdWorldStateAdapter("https://example.test");
  const worldAdapter: WorldStateAdapter = {
    source: worldParser.source,
    fetch: async () => fixtureSnapshot(),
    parse: (snapshot) => worldParser.parse(snapshot),
  };
  const catalogAdapter: SourceAdapter = {
    source: {
      id: "catalog-fixture",
      name: "Catalog fixture",
      homepage: "https://example.test/catalog",
      priority: 1,
    },
    fetch: async () =>
      createSnapshot({
        sourceId: "catalog-fixture",
        version: "v1",
        retrievedAt: "2026-10-14T00:00:00.000Z",
        mediaType: "application/json",
        bytes: new TextEncoder().encode("{}"),
      }),
    async *parse(snapshot) {
      yield {
        type: "entity",
        kind: "resource",
        externalIds: [
          { sourceId: "catalog-fixture", namespace: "id", value: "sample" },
        ],
        fields: { name: "Sample", slug: "sample" },
        evidence: {
          sourceId: "catalog-fixture",
          sourceRecordKey: "sample",
          snapshotVersion: snapshot.version,
          retrievedAt: snapshot.retrievedAt,
        },
      };
    },
  };
  const options = {
    database,
    snapshotStore: new SnapshotStore(path.join(root, "sources")),
    worldStateAdapter: worldAdapter,
    catalogAdapters: [catalogAdapter],
    owner: "catalog-worker",
    refreshIntervalMilliseconds: 300,
    catalogRefreshIntervalMilliseconds: 1_000,
  };
  const abandonedRefreshId = beginSourceRefresh(
    database,
    {
      id: "abandoned-fixture",
      name: "Abandoned fixture",
      homepage: "https://example.test/abandoned",
      priority: 1,
    },
    -600_000,
  );

  assert.equal(
    (await runWorkerCycle({ ...options, now: 100 })).sourceId,
    "wfcd-worldstate",
  );
  assert.deepEqual(
    database
      .prepare(
        "select status, finished_at as finishedAt, error from source_refreshes where id = ?",
      )
      .get(abandonedRefreshId),
    {
      status: "failed",
      finishedAt: 100,
      error: "Refresh process ended before completion",
    },
  );
  assert.deepEqual(await runWorkerCycle({ ...options, now: 100 }), {
    status: "succeeded",
    sourceId: "catalog-fixture",
  });
  assert.deepEqual(await runWorkerCycle({ ...options, now: 101 }), {
    status: "idle",
  });
  assert.deepEqual(
    database.prepare("select name from entities where slug = 'sample'").get(),
    { name: "Sample" },
  );
});

function fixtureSnapshot(timestamp = "2026-10-13T21:00:00.000Z"): Snapshot {
  return createSnapshot({
    sourceId: "wfcd-worldstate",
    version: timestamp,
    retrievedAt: timestamp,
    mediaType: "application/json",
    bytes: new TextEncoder().encode(
      JSON.stringify({
        timestamp,
        cetusCycle: {
          id: "cetus",
          activation: "2026-10-13T20:30:00.000Z",
          expiry: "2026-10-13T22:00:00.000Z",
          state: "night",
        },
      }),
    ),
  });
}
