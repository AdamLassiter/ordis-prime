import type { JobRecord } from "@ordis-prime/db";

export interface WorkerQueueHealth {
  overdueUnclaimedCount: number;
  appearsInactive: boolean;
}

export interface WorkerTaskSummary {
  key: string;
  kind: string;
  sourceId: string;
  displayedRun: JobRecord;
}

const STATUS_PRIORITY: Record<JobRecord["status"], number> = {
  running: 0,
  queued: 1,
  failed: 2,
  succeeded: 3,
};

export function getWorkerQueueHealth(
  jobs: JobRecord[],
  now = Date.now(),
  graceMilliseconds = 15_000,
): WorkerQueueHealth {
  const hasActiveLease = jobs.some(
    (job) =>
      job.status === "running" &&
      job.leaseUntil !== undefined &&
      job.leaseUntil > now,
  );
  const overdueUnclaimedCount = jobs.filter(
    (job) => job.status === "queued" && job.runAfter <= now - graceMilliseconds,
  ).length;

  return {
    overdueUnclaimedCount,
    appearsInactive: overdueUnclaimedCount > 0 && !hasActiveLease,
  };
}

export function summarizeWorkerTasks(jobs: JobRecord[]): WorkerTaskSummary[] {
  const tasks = new Map<string, WorkerTaskSummary>();
  for (const job of jobs) {
    const sourceId =
      typeof job.payload.source === "string"
        ? job.payload.source
        : "unknown-source";
    const key = JSON.stringify([job.kind, sourceId]);
    const existing = tasks.get(key);
    if (
      !existing ||
      STATUS_PRIORITY[job.status] <
        STATUS_PRIORITY[existing.displayedRun.status]
    )
      tasks.set(key, {
        key,
        kind: job.kind,
        sourceId,
        displayedRun: job,
      });
  }
  return [...tasks.values()].sort(
    (left, right) =>
      STATUS_PRIORITY[left.displayedRun.status] -
        STATUS_PRIORITY[right.displayedRun.status] ||
      left.sourceId.localeCompare(right.sourceId) ||
      left.kind.localeCompare(right.kind),
  );
}
