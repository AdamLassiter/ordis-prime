import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { claimDueJob, ensurePendingJob, finishAndRescheduleJob, migrateDatabase, openSqliteDatabase } from "../src/index.ts";

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
