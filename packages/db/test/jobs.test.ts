import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { claimDueJob, enqueueJobNow, ensurePendingJob, finishAndRescheduleJob, migrateDatabase, openSqliteDatabase, pruneFinishedJobs } from "../src/index.ts";

test("database leases serialize recurring jobs and recover expired workers", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-jobs-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "jobs.sqlite");
  migrateDatabase(databasePath);
  const first = openSqliteDatabase(databasePath);
  const second = openSqliteDatabase(databasePath);
  context.after(() => { first.close(); second.close(); });

  const id = ensurePendingJob(first, { kind: "refresh-world-state", payload: { source: "wfcd-worldstate" }, runAfter: 100 });
  assert.equal(ensurePendingJob(second, { kind: "refresh-world-state", payload: { source: "wfcd-worldstate" }, runAfter: 100 }), id);
  assert.equal(claimDueJob(first, { owner: "worker-a", now: 99, leaseMilliseconds: 50, kinds: ["refresh-world-state"] }), undefined);
  assert.equal(claimDueJob(first, { owner: "worker-a", now: 100, leaseMilliseconds: 50, kinds: ["refresh-world-state"] })?.id, id);
  assert.equal(claimDueJob(second, { owner: "worker-b", now: 100, leaseMilliseconds: 50, kinds: ["refresh-world-state"] }), undefined);

  const recovered = claimDueJob(second, { owner: "worker-b", now: 151, leaseMilliseconds: 50, kinds: ["refresh-world-state"] });
  assert.equal(recovered?.id, id);
  const nextId = finishAndRescheduleJob(second, { id, owner: "worker-b", succeeded: true, kind: recovered!.kind, payload: recovered!.payload, nextRunAfter: 500 });
  assert.equal(claimDueJob(first, { owner: "worker-a", now: 499, leaseMilliseconds: 50, kinds: ["refresh-world-state"] }), undefined);
  assert.equal(claimDueJob(first, { owner: "worker-a", now: 500, leaseMilliseconds: 50, kinds: ["refresh-world-state"] })?.id, nextId);
});

test("manual enqueue brings scheduled work forward without duplication", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-jobs-expedite-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "jobs.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const id = ensurePendingJob(database, { kind: "refresh", payload: { source: "items" }, runAfter: 10_000 });
  assert.equal(enqueueJobNow(database, { kind: "refresh", payload: { source: "items" }, now: 100 }), id);
  assert.deepEqual(database.prepare("select count(*) as count, min(run_after) as runAfter from jobs where status = 'queued'").get(), { count: 1, runAfter: 100 });
});

test("job pruning retains the newest bounded history and never deletes active work", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-jobs-prune-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "jobs.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const insert = database.prepare("insert into jobs (id, kind, status, payload_json, run_after) values (?, 'refresh', ?, '{}', ?)");
  insert.run("old-success", "succeeded", 1);
  insert.run("old-failure", "failed", 2);
  insert.run("new-success", "succeeded", 3);
  insert.run("queued", "queued", 4);
  insert.run("running", "running", 5);

  assert.equal(pruneFinishedJobs(database, 1), 2);
  assert.deepEqual(database.prepare("select id, status from jobs order by run_after").all(), [
    { id: "new-success", status: "succeeded" },
    { id: "queued", status: "queued" },
    { id: "running", status: "running" },
  ]);
  assert.equal(pruneFinishedJobs(database, 1), 0);
  assert.throws(() => pruneFinishedJobs(database, -1), /between 0 and 100000/);
});
