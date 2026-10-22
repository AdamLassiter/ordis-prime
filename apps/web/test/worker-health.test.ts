import assert from "node:assert/strict";
import test from "node:test";
import type { JobRecord } from "@ordis-prime/db";
import {
  getWorkerQueueHealth,
  summarizeWorkerTasks,
} from "../app/data-sources/worker-health.ts";

const NOW = 100_000;

function job(overrides: Partial<JobRecord>): JobRecord {
  return {
    id: "job-id",
    kind: "refresh-world-state",
    payload: {},
    runAfter: NOW,
    status: "queued",
    ...overrides,
  };
}

test("worker queue health allows the polling grace period", () => {
  assert.deepEqual(
    getWorkerQueueHealth([job({ runAfter: NOW - 14_999 })], NOW),
    { overdueUnclaimedCount: 0, appearsInactive: false },
  );
});

test("worker queue health identifies overdue unclaimed work", () => {
  assert.deepEqual(
    getWorkerQueueHealth(
      [job({ runAfter: NOW - 20_000 }), job({ id: "later" })],
      NOW,
    ),
    { overdueUnclaimedCount: 1, appearsInactive: true },
  );
});

test("an active lease suppresses the inactive-worker warning", () => {
  assert.deepEqual(
    getWorkerQueueHealth(
      [
        job({ runAfter: NOW - 20_000 }),
        job({
          id: "running",
          status: "running",
          leaseOwner: "worker-1",
          leaseUntil: NOW + 5_000,
        }),
      ],
      NOW,
    ),
    { overdueUnclaimedCount: 1, appearsInactive: false },
  );
});

test("worker task summaries deduplicate history and prefer actionable runs", () => {
  const summaries = summarizeWorkerTasks([
    job({
      id: "catalog-succeeded",
      kind: "refresh-catalog-source",
      payload: { source: "wfcd-items" },
      status: "succeeded",
    }),
    job({
      id: "world-failed",
      payload: { source: "wfcd-worldstate" },
      status: "failed",
    }),
    job({
      id: "catalog-queued",
      kind: "refresh-catalog-source",
      payload: { source: "wfcd-items" },
      status: "queued",
    }),
    job({
      id: "world-running",
      payload: { source: "wfcd-worldstate" },
      status: "running",
      leaseOwner: "worker-1",
      leaseUntil: NOW + 5_000,
    }),
  ]);

  assert.deepEqual(
    summaries.map(({ sourceId, displayedRun }) => [
      sourceId,
      displayedRun.id,
      displayedRun.status,
    ]),
    [
      ["wfcd-worldstate", "world-running", "running"],
      ["wfcd-items", "catalog-queued", "queued"],
    ],
  );
});

test("worker task summaries retain the newest run when statuses tie", () => {
  const summaries = summarizeWorkerTasks([
    job({
      id: "newest",
      payload: { source: "wfcd-worldstate" },
      status: "succeeded",
    }),
    job({
      id: "older",
      payload: { source: "wfcd-worldstate" },
      status: "succeeded",
    }),
  ]);

  assert.equal(summaries[0]?.displayedRun.id, "newest");
});
