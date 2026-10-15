import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { beginSourceRefresh, completeSourceRefresh, failSourceRefresh, getSourceRefreshMetrics, listSourceConflicts, listSourceRefreshes, listSourceStatuses, migrateDatabase, openSqliteDatabase, reopenSourceConflict, reviewSourceConflict } from "../src/index.ts";

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
    recordKey: "records[4]", reason: "Ambiguous identity", candidateIds: ["one", "two"], resolvedAt: undefined, reviewEvents: [],
  }]);
});

test("source refresh records expose deterministic throughput metrics", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-source-metrics-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  const source = { id: "fixture", name: "Fixture", homepage: "https://example.test", priority: 10 };
  assert.deepEqual(getSourceRefreshMetrics(sqlite, source.id), { attempts: 0, succeeded: 0, failed: 0, recordsProcessed: 0, averageDurationMilliseconds: undefined, recordsPerSecond: undefined });
  const refreshId = beginSourceRefresh(sqlite, source, 1_000);
  sqlite.prepare("insert into source_runs (id, source_id, version, content_hash, retrieved_at, status) values ('run', 'fixture', 'v1', 'hash', 1000, 'active')").run();
  completeSourceRefresh(sqlite, refreshId, { sourceRunId: "run", snapshotPath: "/snapshot", recordsProcessed: 250, finishedAt: 3_000 });
  const failedId = beginSourceRefresh(sqlite, source, 4_000);
  failSourceRefresh(sqlite, failedId, new Error("nope"));

  assert.equal(listSourceRefreshes(sqlite, source.id)[1]?.recordsProcessed, 250);
  assert.deepEqual(getSourceRefreshMetrics(sqlite, source.id), {
    attempts: 2, succeeded: 1, failed: 1, recordsProcessed: 250,
    averageDurationMilliseconds: 2_000, recordsPerSecond: 125,
  });
  assert.throws(() => completeSourceRefresh(sqlite, "missing", { sourceRunId: "run", snapshotPath: "/snapshot", recordsProcessed: -1 }), /record count/);
});

test("administrator conflict reviews are source-scoped, reversible, and audited", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-conflict-review-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  const now = 1_800_000_000_000;
  sqlite.prepare("insert into users (id, username, email, email_verified, role, created_at, updated_at) values ('admin', 'Operator', 'operator@example.test', 1, 'admin', ?, ?)").run(now, now);
  sqlite.prepare("insert into sources (id, name, homepage, priority, enabled) values ('fixture', 'Fixture', 'https://example.test', 10, 1)").run();
  sqlite.prepare("insert into source_runs (id, source_id, version, content_hash, retrieved_at, status) values ('run', 'fixture', 'v1', 'hash', ?, 'active')").run(now);
  sqlite.prepare("insert into ingestion_conflicts (id, source_run_id, record_key, reason, candidates_json) values ('conflict', 'run', 'record', 'Ambiguous', '[]')").run();

  assert.throws(() => reviewSourceConflict(sqlite, { sourceId: "other", conflictId: "conflict", userId: "admin", note: "Wrong source" }), /not available/);
  reviewSourceConflict(sqlite, { sourceId: "fixture", conflictId: "conflict", userId: "admin", note: "  Upstream record is obsolete.  ", now });
  let conflict = listSourceConflicts(sqlite, "fixture")[0]!;
  assert.equal(conflict.resolvedAt, now);
  assert.deepEqual(conflict.reviewEvents, [{ id: conflict.reviewEvents[0]!.id, action: "reviewed", note: "Upstream record is obsolete.", createdAt: now, actor: "Operator" }]);

  reopenSourceConflict(sqlite, { sourceId: "fixture", conflictId: "conflict", userId: "admin", note: "Needs another look", now: now + 1 });
  conflict = listSourceConflicts(sqlite, "fixture")[0]!;
  assert.equal(conflict.resolvedAt, undefined);
  assert.deepEqual(conflict.reviewEvents.map(({ action, note, actor }) => ({ action, note, actor })), [
    { action: "reviewed", note: "Upstream record is obsolete.", actor: "Operator" },
    { action: "reopened", note: "Needs another look", actor: "Operator" },
  ]);
  assert.throws(() => reopenSourceConflict(sqlite, { sourceId: "fixture", conflictId: "conflict", userId: "admin", note: "Again" }), /not available/);
});
