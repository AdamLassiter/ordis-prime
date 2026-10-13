import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { beginSourceRefresh, failSourceRefresh, listSourceConflicts, listSourceRefreshes, listSourceStatuses, migrateDatabase, openSqliteDatabase } from "../src/index.ts";

test("source status exposes the latest persisted refresh failure", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-source-operations-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  const source = { id: "fixture", name: "Fixture", homepage: "https://example.test", priority: 10 };
  const refreshId = beginSourceRefresh(sqlite, source);
  failSourceRefresh(sqlite, refreshId, new Error("bad payload"), "/snapshots/fixture/v1");

  assert.equal(listSourceStatuses(sqlite)[0]?.latestRefreshStatus, "failed");
  assert.deepEqual(listSourceRefreshes(sqlite, source.id).map(({ status, snapshotPath, error }) => ({ status, snapshotPath, error })), [{
    status: "failed", snapshotPath: "/snapshots/fixture/v1", error: "Error: bad payload",
  }]);

  sqlite.prepare("insert into source_runs (id, source_id, version, content_hash, retrieved_at, snapshot_path, status) values ('run', ?, 'v1', 'hash', ?, '/snapshots/fixture/v1', 'active')")
    .run(source.id, Date.now());
  sqlite.prepare("insert into ingestion_conflicts (id, source_run_id, record_key, reason, candidates_json) values ('conflict', 'run', 'records[4]', 'Ambiguous identity', '[\"one\",\"two\"]')").run();
  assert.deepEqual(listSourceConflicts(sqlite, source.id), [{
    id: "conflict", sourceRunId: "run", version: "v1", snapshotPath: "/snapshots/fixture/v1",
    recordKey: "records[4]", reason: "Ambiguous identity", candidateIds: ["one", "two"], resolvedAt: undefined,
  }]);
});
