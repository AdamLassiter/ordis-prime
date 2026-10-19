import { hostname } from "node:os";
import path from "node:path";
import { migrateDatabase, openSqliteDatabase } from "@ordis-prime/db";
import { SnapshotStore } from "./snapshot-store.ts";
import { WfcdWorldStateAdapter } from "./world-state.ts";
import { runWorkerCycle } from "./worker.ts";
import { WfcdDropsAdapter } from "./adapters/wfcd-drops.ts";
import { WfcdItemsAdapter } from "./adapters/wfcd-items.ts";
import { WarframeWikiWeaponsAdapter } from "./adapters/warframe-wiki-weapons.ts";
import { WarframeWikiWarframesAdapter } from "./adapters/warframe-wiki-warframes.ts";
import { WarframeWikiMissionsAdapter } from "./adapters/warframe-wiki-missions.ts";
import { WarframeWikiAbilitiesAdapter } from "./adapters/warframe-wiki-abilities.ts";

const dataDirectory =
  process.env.ORDIS_DATA_DIR ??
  path.join(process.env.INIT_CWD ?? process.cwd(), "data");
const databasePath =
  process.env.ORDIS_DATABASE_URL ??
  path.join(dataDirectory, "ordis-prime.sqlite");
const refreshInterval = positiveInteger(
  process.env.ORDIS_WORLD_STATE_INTERVAL_MS,
  5 * 60_000,
);
const retryInterval = positiveInteger(
  process.env.ORDIS_WORLD_STATE_RETRY_MS,
  60_000,
);
const pollInterval = positiveInteger(process.env.ORDIS_WORKER_POLL_MS, 5_000);
const requestTimeout = positiveInteger(
  process.env.ORDIS_WORLD_STATE_TIMEOUT_MS,
  30_000,
);
const catalogRefreshInterval = positiveInteger(
  process.env.ORDIS_CATALOG_INTERVAL_MS,
  24 * 60 * 60_000,
);
const catalogRequestTimeout = positiveInteger(
  process.env.ORDIS_CATALOG_TIMEOUT_MS,
  5 * 60_000,
);
const jobHistoryLimit = nonNegativeInteger(
  process.env.ORDIS_JOB_HISTORY_LIMIT,
  1_000,
);
const worldStateSnapshotHistoryLimit = nonNegativeInteger(
  process.env.ORDIS_WORLD_STATE_HISTORY_LIMIT,
  288,
);
const notificationRetentionMilliseconds = nonNegativeDuration(
  process.env.ORDIS_NOTIFICATION_RETENTION_MS,
  30 * 24 * 60 * 60_000,
);
const catalogReleaseHistoryLimit = nonNegativeInteger(
  process.env.ORDIS_CATALOG_HISTORY_LIMIT,
  20,
);
const sourceRefreshHistoryLimit = nonNegativeInteger(
  process.env.ORDIS_SOURCE_REFRESH_HISTORY_LIMIT,
  1_000,
);
const snapshotPruneGraceMilliseconds = nonNegativeDuration(
  process.env.ORDIS_SNAPSHOT_PRUNE_GRACE_MS,
  60 * 60_000,
);
const owner = `${hostname()}:${process.pid}`;
const abortController = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => abortController.abort());

migrateDatabase(databasePath);
const database = openSqliteDatabase(databasePath);
const snapshotStore = new SnapshotStore(path.join(dataDirectory, "sources"));
const adapter = new WfcdWorldStateAdapter();
const catalogAdapters = [
  new WfcdItemsAdapter(),
  new WfcdDropsAdapter(),
  new WarframeWikiWeaponsAdapter(),
  new WarframeWikiWarframesAdapter(),
  new WarframeWikiMissionsAdapter(),
  new WarframeWikiAbilitiesAdapter(),
];
process.stdout.write(
  `${JSON.stringify({ event: "worker-started", owner, databasePath, refreshInterval, catalogRefreshInterval, jobHistoryLimit, worldStateSnapshotHistoryLimit, notificationRetentionMilliseconds, catalogReleaseHistoryLimit, sourceRefreshHistoryLimit, snapshotPruneGraceMilliseconds })}\n`,
);

try {
  while (!abortController.signal.aborted) {
    const result = await runWorkerCycle({
      database,
      snapshotStore,
      worldStateAdapter: adapter,
      catalogAdapters,
      owner,
      refreshIntervalMilliseconds: refreshInterval,
      retryIntervalMilliseconds: retryInterval,
      requestTimeoutMilliseconds: requestTimeout,
      catalogRefreshIntervalMilliseconds: catalogRefreshInterval,
      catalogRequestTimeoutMilliseconds: catalogRequestTimeout,
      jobHistoryLimit,
      worldStateSnapshotHistoryLimit,
      notificationRetentionMilliseconds,
      catalogReleaseHistoryLimit,
      sourceRefreshHistoryLimit,
      snapshotPruneGraceMilliseconds,
    });
    if (result.status !== "idle")
      process.stdout.write(
        `${JSON.stringify({ event: "source-refresh", ...result, at: new Date().toISOString() })}\n`,
      );
    await delay(pollInterval, abortController.signal);
  }
} finally {
  database.close();
  process.stdout.write(
    `${JSON.stringify({ event: "worker-stopped", owner })}\n`,
  );
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`Expected a positive integer, received ${value}`);
  return parsed;
}

function nonNegativeInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 100_000)
    throw new Error(`Expected an integer from 0 to 100000, received ${value}`);
  return parsed;
}

function nonNegativeDuration(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error(`Expected a non-negative duration, received ${value}`);
  return parsed;
}

async function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}
