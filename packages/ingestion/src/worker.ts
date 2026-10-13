import { claimDueJob, ensurePendingJob, finishAndRescheduleJob } from "@ordis-prime/db";
import { SnapshotStore } from "./snapshot-store.ts";
import { refreshWorldState, type WorldStateAdapter } from "./world-state.ts";

const WORLD_STATE_JOB = "refresh-world-state";
type WorkerDatabase = Parameters<typeof ensurePendingJob>[0];

export async function runWorkerCycle(options: {
  database: WorkerDatabase;
  snapshotStore: SnapshotStore;
  worldStateAdapter: WorldStateAdapter;
  owner: string;
  now?: number;
  refreshIntervalMilliseconds?: number;
  retryIntervalMilliseconds?: number;
  requestTimeoutMilliseconds?: number;
}): Promise<{ status: "idle" | "succeeded" | "failed"; error?: string }> {
  const now = options.now ?? Date.now();
  const refreshInterval = options.refreshIntervalMilliseconds ?? 5 * 60_000;
  const retryInterval = options.retryIntervalMilliseconds ?? 60_000;
  const requestTimeout = options.requestTimeoutMilliseconds ?? 30_000;
  const payload = { source: options.worldStateAdapter.source.id };
  ensurePendingJob(options.database, { kind: WORLD_STATE_JOB, payload, runAfter: now });
  const job = claimDueJob(options.database, { owner: options.owner, now, leaseMilliseconds: Math.max(2 * requestTimeout, 2 * 60_000), kinds: [WORLD_STATE_JOB] });
  if (!job) return { status: "idle" };
  try {
    if (job.payload.source !== options.worldStateAdapter.source.id) throw new Error(`Unsupported world-state source ${String(job.payload.source)}`);
    await refreshWorldState({ adapter: options.worldStateAdapter, database: options.database, snapshotStore: options.snapshotStore, signal: AbortSignal.timeout(requestTimeout) });
    finishAndRescheduleJob(options.database, { id: job.id, owner: options.owner, succeeded: true, kind: job.kind, payload: job.payload, nextRunAfter: now + refreshInterval });
    return { status: "succeeded" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishAndRescheduleJob(options.database, { id: job.id, owner: options.owner, succeeded: false, error: message, kind: job.kind, payload: job.payload, nextRunAfter: now + retryInterval });
    return { status: "failed", error: message };
  }
}
