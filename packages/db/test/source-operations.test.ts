import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { beginSourceRefresh, bindSourceIdentityOverride, completeSourceRefresh, failSourceRefresh, getIdentityOverrideRevision, getSourceRefreshMetrics, listIdentityOverrides, listSourceConflicts, listSourceRefreshes, listSourceStatuses, migrateDatabase, openSqliteDatabase, promoteSource, reopenSourceConflict, revokeSourceIdentityOverride, reviewSourceConflict } from "../src/index.ts";

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
    recordKey: "records[4]", reason: "Ambiguous identity", candidateIds: ["one", "two"], candidateEntities: [], externalIds: [], resolvedAt: undefined, reviewEvents: [],
  }]);
});

test("identity overrides bind offered candidates, guide promotion, and revoke auditably", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-identity-override-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  const now = 1_800_000_000_000;
  sqlite.prepare("insert into users (id, username, email, email_verified, role, created_at, updated_at) values ('admin', 'Operator', 'operator@example.test', 1, 'admin', ?, ?)").run(now, now);
  sqlite.prepare("insert into sources (id, name, homepage, priority, enabled) values ('fixture', 'Fixture', 'https://example.test', 10, 1)").run();
  sqlite.prepare("insert into source_runs (id, source_id, version, content_hash, retrieved_at, status) values ('run', 'fixture', 'v1', 'hash', ?, 'active')").run(now);
  sqlite.prepare("insert into entities (id, kind, name, slug, retired, updated_at) values ('one', 'weapon', 'First', 'first', 0, ?), ('two', 'weapon', 'Second', 'second', 0, ?)").run(now, now);
  const externalId = { sourceId: "fixture", namespace: "id", value: "incoming" };
  sqlite.prepare("insert into ingestion_conflicts (id, source_run_id, record_key, reason, candidates_json, external_ids_json) values ('conflict', 'run', 'record', 'Ambiguous', ?, ?)")
    .run(JSON.stringify(["one", "two"]), JSON.stringify([externalId]));

  assert.throws(() => bindSourceIdentityOverride(sqlite, { sourceId: "fixture", conflictId: "conflict", userId: "admin", externalId, entityId: "missing", note: "Wrong" }), /not a conflict candidate/);
  bindSourceIdentityOverride(sqlite, { sourceId: "fixture", conflictId: "conflict", userId: "admin", externalId, entityId: "one", note: "  Same upstream item.  ", now });
  assert.deepEqual(listIdentityOverrides(sqlite, "fixture"), [{
    ownerSourceId: "fixture", externalId, entity: { id: "one", kind: "weapon", slug: "first", name: "First" },
    conflictId: "conflict", actor: "Operator", note: "Same upstream item.", createdAt: now,
  }]);
  assert.equal(getIdentityOverrideRevision(sqlite, "fixture"), `1-${now}`);
  assert.equal(listSourceConflicts(sqlite, "fixture")[0]?.resolvedAt, now);

  const evidence = { sourceId: "fixture", sourceRecordKey: "incoming", snapshotVersion: "v2", retrievedAt: "2027-01-15T08:00:00.000Z" };
  const promoted = promoteSource(sqlite, {
    source: { id: "fixture", name: "Fixture", homepage: "https://example.test", priority: 10 }, version: "v2", contentHash: "hash-v2", retrievedAt: evidence.retrievedAt,
    observations: [{ type: "entity", kind: "weapon", externalIds: [externalId], fields: { name: "First", slug: "first" }, evidence }],
  });
  assert.equal(promoted.conflictsCreated, 0);
  assert.deepEqual(sqlite.prepare("select entity_id as entityId from external_ids where source_id = 'fixture' and namespace = 'id' and value = 'incoming'").get(), { entityId: "one" });

  revokeSourceIdentityOverride(sqlite, { sourceId: "fixture", userId: "admin", externalId, note: "Mapping was incorrect", now: now + 1 });
  assert.deepEqual(listIdentityOverrides(sqlite, "fixture"), []);
  assert.equal(getIdentityOverrideRevision(sqlite, "fixture"), `2-${now + 1}`);
  assert.equal(sqlite.prepare("select 1 from external_ids where source_id = 'fixture' and namespace = 'id' and value = 'incoming'").get(), undefined);
  const reopened = listSourceConflicts(sqlite, "fixture").find(({ id }) => id === "conflict")!;
  assert.equal(reopened.resolvedAt, undefined);
  assert.deepEqual(reopened.reviewEvents.map(({ action, note }) => ({ action, note })), [
    { action: "reviewed", note: "Identity override: Same upstream item." },
    { action: "reopened", note: "Identity override revoked: Mapping was incorrect" },
  ]);
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
