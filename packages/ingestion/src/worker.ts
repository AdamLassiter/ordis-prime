import { CATALOG_SOURCE_REFRESH_JOB, claimDueJob, ensurePendingJob, evaluateWorldStateWatches, finishAndRescheduleJob, pruneFinishedJobs, pruneInactiveWorldStateSnapshots, pruneReadExpiredPlayerNotifications, WORLD_STATE_REFRESH_JOB } from "@ordis-prime/db";
import { SnapshotStore } from "./snapshot-store.ts";
import { refreshWorldState, type WorldStateAdapter } from "./world-state.ts";
import { refreshSource } from "./refresh.ts";
import type { SourceAdapter } from "./adapter.ts";

type WorkerDatabase = Parameters<typeof ensurePendingJob>[0];

export async function runWorkerCycle(options: {
  database: WorkerDatabase;
  snapshotStore: SnapshotStore;
  worldStateAdapter: WorldStateAdapter;
  catalogAdapters?: SourceAdapter[];
  owner: string;
  now?: number;
  refreshIntervalMilliseconds?: number;
  retryIntervalMilliseconds?: number;
  requestTimeoutMilliseconds?: number;
  catalogRefreshIntervalMilliseconds?: number;
  catalogRequestTimeoutMilliseconds?: number;
  jobHistoryLimit?: number;
  worldStateSnapshotHistoryLimit?: number;
  notificationRetentionMilliseconds?: number;
}): Promise<{ status: "idle" | "succeeded" | "failed"; sourceId?: string; notificationsCreated?: number; error?: string }> {
  const now = options.now ?? Date.now();
  const refreshInterval = options.refreshIntervalMilliseconds ?? 5 * 60_000;
  const retryInterval = options.retryIntervalMilliseconds ?? 60_000;
  const requestTimeout = options.requestTimeoutMilliseconds ?? 30_000;
  const catalogRefreshInterval = options.catalogRefreshIntervalMilliseconds ?? 24 * 60 * 60_000;
  const catalogRequestTimeout = options.catalogRequestTimeoutMilliseconds ?? 5 * 60_000;
  const jobHistoryLimit = options.jobHistoryLimit ?? 1_000;
  const worldStateSnapshotHistoryLimit = options.worldStateSnapshotHistoryLimit ?? 288;
  const notificationRetentionMilliseconds = options.notificationRetentionMilliseconds ?? 30 * 24 * 60 * 60_000;
  const payload = { source: options.worldStateAdapter.source.id };
  ensurePendingJob(options.database, { kind: WORLD_STATE_REFRESH_JOB, payload, runAfter: now });
  for (const adapter of options.catalogAdapters ?? []) ensurePendingJob(options.database, { kind: CATALOG_SOURCE_REFRESH_JOB, payload: { source: adapter.source.id }, runAfter: now });
  pruneFinishedJobs(options.database, jobHistoryLimit);
  const job = claimDueJob(options.database, { owner: options.owner, now, leaseMilliseconds: Math.max(2 * catalogRequestTimeout, 2 * requestTimeout, 2 * 60_000), kinds: [WORLD_STATE_REFRESH_JOB, CATALOG_SOURCE_REFRESH_JOB] });
  if (!job) return { status: "idle" };
  const sourceId = typeof job.payload.source === "string" ? job.payload.source : undefined;
  try {
    if (job.kind === WORLD_STATE_REFRESH_JOB) {
      if (sourceId !== options.worldStateAdapter.source.id) throw new Error(`Unsupported world-state source ${String(job.payload.source)}`);
      await refreshWorldState({ adapter: options.worldStateAdapter, database: options.database, snapshotStore: options.snapshotStore, signal: AbortSignal.timeout(requestTimeout) });
      pruneInactiveWorldStateSnapshots(options.database, worldStateSnapshotHistoryLimit);
      const notificationsCreated = evaluateWorldStateWatches(options.database, now);
      pruneReadExpiredPlayerNotifications(options.database, now, notificationRetentionMilliseconds);
      finishAndRescheduleJob(options.database, { id: job.id, owner: options.owner, succeeded: true, kind: job.kind, payload: job.payload, nextRunAfter: now + refreshInterval });
      return { status: "succeeded", sourceId, notificationsCreated };
    }
    const adapter = options.catalogAdapters?.find((candidate) => candidate.source.id === sourceId);
    if (!adapter) throw new Error(`Unsupported catalog source ${String(job.payload.source)}`);
    await refreshSource({ adapter, database: options.database, snapshotStore: options.snapshotStore, signal: AbortSignal.timeout(catalogRequestTimeout) });
    finishAndRescheduleJob(options.database, { id: job.id, owner: options.owner, succeeded: true, kind: job.kind, payload: job.payload, nextRunAfter: now + catalogRefreshInterval });
    return { status: "succeeded", sourceId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishAndRescheduleJob(options.database, { id: job.id, owner: options.owner, succeeded: false, error: message, kind: job.kind, payload: job.payload, nextRunAfter: now + retryInterval });
    return { status: "failed", sourceId, error: message };
  }
}
