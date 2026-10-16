import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  beginSourceRefresh,
  completeSourceRefresh,
  migrateDatabase,
  openSqliteDatabase,
  promoteWorldState,
  pruneInactiveWorldStateSnapshots,
} from "../src/index.ts";

test("world-state nodes reconcile unique aliases but preserve ambiguity", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-world-alias-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "world-state.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  sqlite
    .prepare(
      `insert into entities (id, kind, name, slug, retired, updated_at) values
       ('node-one', 'node', 'Canonical One', 'canonical-one', 0, 1),
       ('node-two', 'node', 'Canonical Two', 'canonical-two', 0, 1)`,
    )
    .run();
  sqlite
    .prepare(
      `insert into entity_aliases (entity_id, normalized, display) values
       ('node-one', 'uniquerelay', 'Unique Relay'),
       ('node-one', 'sharedrelay', 'Shared Relay'),
       ('node-two', 'sharedrelay', 'Shared Relay')`,
    )
    .run();
  sqlite
    .prepare(
      "insert into sources (id, name, homepage, priority, enabled) values ('catalog', 'Catalog', 'https://example.test/catalog', 1, 1)",
    )
    .run();
  sqlite
    .prepare(
      "insert into source_runs (id, source_id, version, content_hash, retrieved_at, status) values ('catalog-run', 'catalog', 'v1', 'hash', 1, 'active')",
    )
    .run();
  sqlite
    .prepare(
      `insert into node_details (id, entity_id, planet, source_run_id, source_record_key) values
       ('detail-one', 'node-one', 'Earth', 'catalog-run', 'one'),
       ('detail-two', 'node-two', 'Venus', 'catalog-run', 'two')`,
    )
    .run();
  const version = "2026-10-13T20:30:00.000Z";
  promoteWorldState(sqlite, {
    source: {
      id: "world-fixture",
      name: "World fixture",
      homepage: "https://example.test",
      priority: 1,
    },
    version,
    contentHash: "alias-hash",
    observedAt: version,
    snapshotPath: "/snapshots/alias",
    windows: [
      {
        type: "world-state-window",
        externalId: "unique",
        kind: "fissure",
        label: "Unique",
        nodeLabel: "Unique Relay",
        evidence: {
          sourceId: "world-fixture",
          sourceRecordKey: "unique",
          snapshotVersion: version,
          retrievedAt: version,
        },
      },
      {
        type: "world-state-window",
        externalId: "ambiguous",
        kind: "fissure",
        label: "Ambiguous",
        nodeLabel: "Shared Relay",
        evidence: {
          sourceId: "world-fixture",
          sourceRecordKey: "ambiguous",
          snapshotVersion: version,
          retrievedAt: version,
        },
      },
      {
        type: "world-state-window",
        externalId: "planet-qualified",
        kind: "fissure",
        label: "Qualified",
        nodeLabel: "Shared Relay (Venus)",
        evidence: {
          sourceId: "world-fixture",
          sourceRecordKey: "planet-qualified",
          snapshotVersion: version,
          retrievedAt: version,
        },
      },
    ],
  });

  assert.deepEqual(
    sqlite
      .prepare(
        "select external_id as externalId, node_entity_id as nodeEntityId from world_state_windows order by external_id",
      )
      .all(),
    [
      { externalId: "ambiguous", nodeEntityId: null },
      { externalId: "planet-qualified", nodeEntityId: "node-two" },
      { externalId: "unique", nodeEntityId: "node-one" },
    ],
  );
});

test("world-state pruning keeps each active snapshot and bounded inactive history", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-world-state-prune-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "world-state.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  const source = {
    id: "world-fixture",
    name: "World fixture",
    homepage: "https://example.test",
    priority: 1,
  };
  const snapshotIds: string[] = [];

  for (const day of [1, 2, 3]) {
    const version = `2026-10-0${day}T00:00:00.000Z`;
    const refreshId = beginSourceRefresh(sqlite, source, day);
    const promoted = promoteWorldState(sqlite, {
      source,
      version,
      contentHash: `hash-${day}`,
      observedAt: version,
      snapshotPath: `/snapshots/${day}`,
      windows: [
        {
          type: "world-state-window",
          externalId: `window-${day}`,
          kind: "event",
          label: `Event ${day}`,
          evidence: {
            sourceId: source.id,
            sourceRecordKey: `event-${day}`,
            snapshotVersion: version,
            retrievedAt: version,
          },
        },
      ],
    });
    snapshotIds.push(promoted.snapshotId);
    completeSourceRefresh(sqlite, refreshId, {
      worldStateSnapshotId: promoted.snapshotId,
      snapshotPath: `/snapshots/${day}`,
      recordsProcessed: 1,
      finishedAt: day + 1,
    });
  }

  assert.equal(pruneInactiveWorldStateSnapshots(sqlite, 1), 1);
  assert.deepEqual(
    sqlite
      .prepare(
        "select id, active from world_state_snapshots order by observed_at",
      )
      .all(),
    [
      { id: snapshotIds[1], active: 0 },
      { id: snapshotIds[2], active: 1 },
    ],
  );
  assert.equal(
    (
      sqlite
        .prepare("select count(*) as count from world_state_windows")
        .get() as { count: number }
    ).count,
    2,
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "select status, snapshot_path as snapshotPath, world_state_snapshot_id as snapshotId from source_refreshes order by started_at",
      )
      .all(),
    [
      { status: "succeeded", snapshotPath: "/snapshots/1", snapshotId: null },
      {
        status: "succeeded",
        snapshotPath: "/snapshots/2",
        snapshotId: snapshotIds[1],
      },
      {
        status: "succeeded",
        snapshotPath: "/snapshots/3",
        snapshotId: snapshotIds[2],
      },
    ],
  );
  assert.equal(pruneInactiveWorldStateSnapshots(sqlite, 0), 1);
  assert.deepEqual(
    sqlite.prepare("select id, active from world_state_snapshots").all(),
    [{ id: snapshotIds[2], active: 1 }],
  );
  assert.throws(
    () => pruneInactiveWorldStateSnapshots(sqlite, -1),
    /between 0 and 100000/,
  );
});
