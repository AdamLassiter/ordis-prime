import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { beginSourceRefresh, completeSourceRefresh, migrateDatabase, openSqliteDatabase, promoteWorldState, pruneInactiveWorldStateSnapshots } from "../src/index.ts";

test("world-state pruning keeps each active snapshot and bounded inactive history", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-world-state-prune-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "world-state.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  const source = { id: "world-fixture", name: "World fixture", homepage: "https://example.test", priority: 1 };
  const snapshotIds: string[] = [];

  for (const day of [1, 2, 3]) {
    const version = `2026-10-0${day}T00:00:00.000Z`;
    const refreshId = beginSourceRefresh(sqlite, source, day);
    const promoted = promoteWorldState(sqlite, {
      source, version, contentHash: `hash-${day}`, observedAt: version, snapshotPath: `/snapshots/${day}`,
      windows: [{ type: "world-state-window", externalId: `window-${day}`, kind: "event", label: `Event ${day}`, evidence: { sourceId: source.id, sourceRecordKey: `event-${day}`, snapshotVersion: version, retrievedAt: version } }],
    });
    snapshotIds.push(promoted.snapshotId);
    completeSourceRefresh(sqlite, refreshId, { worldStateSnapshotId: promoted.snapshotId, snapshotPath: `/snapshots/${day}`, recordsProcessed: 1, finishedAt: day + 1 });
  }

  assert.equal(pruneInactiveWorldStateSnapshots(sqlite, 1), 1);
  assert.deepEqual(sqlite.prepare("select id, active from world_state_snapshots order by observed_at").all(), [
    { id: snapshotIds[1], active: 0 }, { id: snapshotIds[2], active: 1 },
  ]);
  assert.equal((sqlite.prepare("select count(*) as count from world_state_windows").get() as { count: number }).count, 2);
  assert.deepEqual(sqlite.prepare("select status, snapshot_path as snapshotPath, world_state_snapshot_id as snapshotId from source_refreshes order by started_at").all(), [
    { status: "succeeded", snapshotPath: "/snapshots/1", snapshotId: null },
    { status: "succeeded", snapshotPath: "/snapshots/2", snapshotId: snapshotIds[1] },
    { status: "succeeded", snapshotPath: "/snapshots/3", snapshotId: snapshotIds[2] },
  ]);
  assert.equal(pruneInactiveWorldStateSnapshots(sqlite, 0), 1);
  assert.deepEqual(sqlite.prepare("select id, active from world_state_snapshots").all(), [{ id: snapshotIds[2], active: 1 }]);
  assert.throws(() => pruneInactiveWorldStateSnapshots(sqlite, -1), /between 0 and 100000/);
});
